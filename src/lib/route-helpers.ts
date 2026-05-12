import { prisma } from './db'
import { env } from './env'
import { auth } from './auth'

export type ProjectRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60
export const SESSION_REFRESH_THRESHOLD_SEC = 24 * 60 * 60

export function getIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

export function getPublicOrigin(request: Request): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, '')
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto ?? url.protocol.replace(':', '')}://${host}`
}

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

export function isSystemAdmin(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function canManageProject(
  authCtx: { role: string },
  membership: { role: ProjectRole } | null,
): boolean {
  if (isSystemAdmin(authCtx.role)) return true
  return membership?.role === 'OWNER' || membership?.role === 'PM'
}

export function canGrantProjectOwner(
  authCtx: { role: string },
  membership: { role: ProjectRole } | null,
): boolean {
  if (authCtx.role === 'SUPER_ADMIN') return true
  return membership?.role === 'OWNER'
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
      await prisma.session
        .update({ where: { id: plainSession.id }, data: { expiresAt: newExpiry } })
        .catch(() => {})
      if (responseHeaders) responseHeaders.set('set-cookie', sessionCookie(rawToken, SESSION_TTL_SEC))
    }
    if (
      env.SUPER_ADMIN_EMAILS.includes(plainSession.user.email) &&
      plainSession.user.role !== 'SUPER_ADMIN'
    ) {
      await prisma.user
        .update({ where: { id: plainSession.user.id }, data: { role: 'SUPER_ADMIN' } })
        .catch(() => {})
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
    await prisma.user
      .update({ where: { id: baSession.user.id }, data: { role: 'SUPER_ADMIN' } })
      .catch(() => {})
    return { userId: baSession.user.id, role: 'SUPER_ADMIN', email: baSession.user.email }
  }

  return { userId: baSession.user.id, role: userRole, email: baSession.user.email }
}

export async function requireProjectMember(
  projectId: string,
  userId: string,
): Promise<{ role: ProjectRole } | null> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return m
}

export async function canReadProject(
  projectId: string,
  authCtx: { userId: string; role: string },
): Promise<{ ok: boolean; status: 403 | 404 | null; membership: { role: ProjectRole } | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { visibility: true },
  })
  if (!project) return { ok: false, status: 404, membership: null }
  const membership = await requireProjectMember(projectId, authCtx.userId)
  const admin = isSystemAdmin(authCtx.role)
  const isVisible =
    admin ||
    membership != null ||
    project.visibility === 'INTERNAL' ||
    project.visibility === 'PUBLIC'
  if (!isVisible) return { ok: false, status: 403, membership }
  return { ok: true, status: null, membership }
}

export function getAllowedTaskTransitions(current: string, kind: 'TASK' | 'BUG' | 'QC'): string[] {
  if (kind === 'TASK') {
    const m: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'CLOSED'],
      CLOSED: ['REOPENED'],
      REOPENED: ['IN_PROGRESS', 'CLOSED'],
      READY_FOR_QC: ['CLOSED', 'REOPENED'],
    }
    return m[current] ?? []
  }
  const m: Record<string, string[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  }
  return m[current] ?? []
}

export function computeActualHours(task: {
  startsAt: Date | null
  createdAt: Date
  closedAt: Date | null
}): number | null {
  if (!task.closedAt) return null
  const start = (task.startsAt ?? task.createdAt).getTime()
  const end = task.closedAt.getTime()
  if (end <= start) return 0
  return Math.round(((end - start) / 3_600_000) * 100) / 100
}

export function computeProgressPercent(task: {
  progressPercent: number | null
  status: string
  checklist?: { done: boolean }[]
}): number | null {
  if (task.status === 'CLOSED') return 100
  if (task.checklist && task.checklist.length > 0) {
    const done = task.checklist.filter((c) => c.done).length
    return Math.round((done / task.checklist.length) * 100)
  }
  return task.progressPercent
}
