// Session-cookie auth: parse the cookie token, mint the Set-Cookie header,
// and resolve a request to an authenticated user (DB session first, Better
// Auth fallback), including sliding-expiry refresh and SUPER_ADMIN promotion.
import { auth } from './auth'
import { prisma } from './db'
import { env } from './env'

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60
export const SESSION_REFRESH_THRESHOLD_SEC = 24 * 60 * 60

export function extractSessionToken(cookie: string): string | undefined {
  const raw = cookie.match(/session=([^;]+)/)?.[1]
  if (!raw) return undefined
  const decoded = decodeURIComponent(raw)
  return decoded.includes('.') ? decoded.slice(0, decoded.lastIndexOf('.')) : decoded
}

export function sessionCookie(value: string, maxAgeSec: number): string {
  const isProd = process.env.NODE_ENV === 'production'
  const secure = isProd ? '; Secure' : ''
  const sameSite = isProd ? 'Strict' : 'Lax'
  return `session=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSec}${secure}`
}

export async function requireAuth(
  request: Request,
  responseHeaders?: Headers,
): Promise<{ userId: string; role: string; email: string } | null> {
  const cookie = request.headers.get('cookie') ?? ''
  const rawToken = cookie.match(/session=([^;]+)/)?.[1]
  if (!rawToken) return null
  const plainTokenForDb = extractSessionToken(cookie)

  const plainSession = plainTokenForDb
    ? await prisma.session.findUnique({
        where: { token: plainTokenForDb },
        include: { user: { select: { id: true, role: true, email: true, blocked: true } } },
      })
    : null

  if (plainSession) {
    if (plainSession.expiresAt < new Date() || plainSession.user.blocked) {
      await prisma.session.delete({ where: { id: plainSession.id } }).catch(() => {})
      return null
    }
    const secondsUntilExpiry = (plainSession.expiresAt.getTime() - Date.now()) / 1000
    if (secondsUntilExpiry < SESSION_TTL_SEC - SESSION_REFRESH_THRESHOLD_SEC) {
      const newExpiry = new Date(Date.now() + SESSION_TTL_SEC * 1000)
      await prisma.session.update({ where: { id: plainSession.id }, data: { expiresAt: newExpiry } }).catch(() => {})
      if (responseHeaders) responseHeaders.set('set-cookie', sessionCookie(rawToken, SESSION_TTL_SEC))
    }
    if (env.SUPER_ADMIN_EMAILS.includes(plainSession.user.email) && plainSession.user.role !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { id: plainSession.user.id }, data: { role: 'SUPER_ADMIN' } }).catch(() => {})
      return { userId: plainSession.user.id, role: 'SUPER_ADMIN', email: plainSession.user.email }
    }
    return {
      userId: plainSession.user.id,
      role: plainSession.user.role,
      email: plainSession.user.email,
    }
  }

  const baSession = await auth.api.getSession({ headers: request.headers })
  if (!baSession) return null

  const userRole = ((baSession.user as unknown as { role: string }).role ?? 'USER') as string
  const isBlocked = (baSession.user as unknown as { blocked: boolean }).blocked ?? false
  if (isBlocked) return null

  if (env.SUPER_ADMIN_EMAILS.includes(baSession.user.email) && userRole !== 'SUPER_ADMIN') {
    await prisma.user.update({ where: { id: baSession.user.id }, data: { role: 'SUPER_ADMIN' } }).catch(() => {})
    return { userId: baSession.user.id, role: 'SUPER_ADMIN', email: baSession.user.email }
  }

  return { userId: baSession.user.id, role: userRole, email: baSession.user.email }
}
