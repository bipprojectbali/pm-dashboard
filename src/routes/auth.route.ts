import { Elysia } from 'elysia'
import { auth } from '../lib/auth'
import { prisma } from '../lib/db'
import { env } from '../lib/env'
import {
  extractSessionToken,
  getIp,
  requireAuth,
  SESSION_TTL_SEC,
  SESSION_REFRESH_THRESHOLD_SEC,
  sessionCookie,
} from '../lib/route-helpers'
import { appLog } from '../lib/applog'
import { redis } from '../lib/redis'

const LOGIN_RATE_WINDOW_SEC = 15 * 60
const LOGIN_RATE_MAX = 10

function loginRateLimitKey(ip: string): string {
  return `login:fail:${ip}`
}

async function loginAttemptsRemaining(ip: string): Promise<number> {
  const val = await redis.get(loginRateLimitKey(ip))
  const count = val ? parseInt(val, 10) : 0
  return Math.max(0, LOGIN_RATE_MAX - count)
}

async function recordLoginFailure(ip: string): Promise<void> {
  const key = loginRateLimitKey(ip)
  const val = await redis.get(key)
  const count = val ? parseInt(val, 10) : 0
  await redis.setex(key, LOGIN_RATE_WINDOW_SEC, String(count + 1))
}

async function clearLoginAttempts(ip: string): Promise<void> {
  await redis.del(loginRateLimitKey(ip))
}

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

export function authRoutes() {
  return new Elysia()
    .all('/api/auth/*', async ({ request }) => auth.handler(request))

    .post('/api/auth/login', async ({ request, set }) => {
      const ip = getIp(request)
      if ((await loginAttemptsRemaining(ip)) === 0) {
        audit(null, 'LOGIN_THROTTLED', null, ip)
        appLog('warn', `Login throttled from ${ip}`, ip)
        set.status = 429
        return { error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' }
      }
      let body: { email?: unknown; password?: unknown }
      try {
        body = (await request.json()) as typeof body
      } catch {
        set.status = 400
        return { error: 'Invalid JSON' }
      }
      const email = typeof body?.email === 'string' ? body.email.trim() : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      if (!email || !password) {
        set.status = 400
        return { error: 'email dan password wajib diisi' }
      }
      let user = await prisma.user.findUnique({ where: { email } })
      if (!user || !(await Bun.password.verify(password, user.password))) {
        await recordLoginFailure(ip)
        audit(user?.id ?? null, 'LOGIN_FAILED', `email: ${email}`, ip)
        appLog('warn', `Login failed: ${email}`, ip)
        set.status = 401
        return { error: 'Email atau password salah' }
      }
      if (user.blocked) {
        audit(user.id, 'LOGIN_BLOCKED', null, ip)
        appLog('warn', `Login blocked: ${email}`, ip)
        set.status = 403
        return { error: 'Akun Anda telah diblokir. Hubungi administrator.' }
      }
      if (env.SUPER_ADMIN_EMAILS.includes(user.email) && user.role !== 'SUPER_ADMIN') {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } })
      }
      await clearLoginAttempts(ip)
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000)
      await prisma.session.create({ data: { token, userId: user.id, expiresAt } })
      set.headers['set-cookie'] = sessionCookie(token, SESSION_TTL_SEC)
      audit(user.id, 'LOGIN', 'via email', ip)
      appLog('info', `Login: ${email} (${user.role})`, ip)
      prisma.account
        .upsert({
          where: { providerId_accountId: { providerId: 'credential', accountId: user.email } },
          update: { password: user.password, updatedAt: new Date() },
          create: {
            accountId: user.email,
            providerId: 'credential',
            userId: user.id,
            password: user.password,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .catch(() => {})
      return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
    })

    .post('/api/auth/logout', async ({ request, set }) => {
      const ip = getIp(request)
      const cookie = request.headers.get('cookie') ?? ''
      const token = extractSessionToken(cookie)
      if (token) {
        const session = await prisma.session.findUnique({
          where: { token },
          select: { userId: true },
        })
        if (session) {
          audit(session.userId, 'LOGOUT', null, ip)
          appLog('info', `Logout: userId=${session.userId}`, ip)
        }
        await prisma.session.deleteMany({ where: { token } })
      }
      set.headers['set-cookie'] = sessionCookie('', 0)
      return { ok: true }
    })

    .get('/api/auth/session', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const rawToken = cookie.match(/session=([^;]+)/)?.[1]
      if (!rawToken) {
        set.status = 401
        return { user: null }
      }
      const decoded = decodeURIComponent(rawToken)
      const token = decoded.includes('.') ? decoded.slice(0, decoded.lastIndexOf('.')) : decoded
      const session = await prisma.session.findUnique({
        where: { token },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, blocked: true } },
        },
      })
      if (!session || session.expiresAt < new Date() || session.user.blocked) {
        if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
        set.status = 401
        return { user: null }
      }
      const secondsUntilExpiry = (session.expiresAt.getTime() - Date.now()) / 1000
      if (secondsUntilExpiry < SESSION_TTL_SEC - SESSION_REFRESH_THRESHOLD_SEC) {
        const newExpiry = new Date(Date.now() + SESSION_TTL_SEC * 1000)
        await prisma.session
          .update({ where: { id: session.id }, data: { expiresAt: newExpiry } })
          .catch(() => {})
        set.headers['set-cookie'] = sessionCookie(rawToken, SESSION_TTL_SEC)
      }
      return { user: session.user }
    })
}
