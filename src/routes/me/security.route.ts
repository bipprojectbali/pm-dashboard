import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken, requireAuth } from '../../lib/route-helpers'

export function meSecurityRoutes() {
  return new Elysia()

    .put('/api/me/password', async ({ request, body, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const { currentPassword, newPassword } = (body ?? {}) as { currentPassword?: string; newPassword?: string }
      if (!newPassword) {
        set.status = 400
        return { error: 'newPassword required' }
      }
      if (newPassword.length < 8) {
        set.status = 400
        return { error: 'Password baru minimal 8 karakter' }
      }
      const user = await prisma.user.findUnique({ where: { id: auth.userId } })
      if (!user) {
        set.status = 404
        return { error: 'User not found' }
      }
      // Google-only accounts have password === '' — they set their first local
      // password without proving a current one. Accounts that already have a
      // password must verify it (prevents session-hijack password takeover).
      const isSettingFirst = user.password === ''
      if (!isSettingFirst) {
        if (!currentPassword) {
          set.status = 400
          return { error: 'currentPassword required' }
        }
        const ok = await Bun.password.verify(currentPassword, user.password)
        if (!ok) {
          set.status = 403
          return { error: 'Password saat ini salah' }
        }
      }
      const hashed = await Bun.password.hash(newPassword)
      await prisma.user.update({ where: { id: auth.userId }, data: { password: hashed } })
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      await prisma.auditLog.create({
        data: {
          userId: auth.userId,
          action: isSettingFirst ? 'PASSWORD_CREATED' : 'PASSWORD_CHANGED',
          detail: null,
          ip,
        },
      })
      return { ok: true }
    })

    .get('/api/me/sessions', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const cookie = request.headers.get('cookie') ?? ''
      const currentToken = extractSessionToken(cookie) ?? ''
      const sessions = await prisma.session.findMany({
        where: { userId: auth.userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, token: true, createdAt: true, expiresAt: true },
      })
      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          isCurrent: s.token === currentToken,
        })),
      }
    })

    .delete('/api/me/sessions/others', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const cookie = request.headers.get('cookie') ?? ''
      const currentToken = extractSessionToken(cookie) ?? ''
      const result = await prisma.session.deleteMany({
        where: { userId: auth.userId, token: { not: currentToken } },
      })
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      await prisma.auditLog.create({
        data: { userId: auth.userId, action: 'SESSIONS_REVOKED', detail: `revoked ${result.count} session(s)`, ip },
      })
      return { revoked: result.count }
    })

    .get('/api/me/audit', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const logs = await prisma.auditLog.findMany({
        where: {
          userId: auth.userId,
          action: {
            in: [
              'LOGIN',
              'LOGOUT',
              'LOGIN_FAILED',
              'LOGIN_BLOCKED',
              'PASSWORD_CREATED',
              'PASSWORD_CHANGED',
              'SESSIONS_REVOKED',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, detail: true, ip: true, createdAt: true },
      })
      return { logs }
    })
}
