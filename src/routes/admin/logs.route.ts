import { Elysia } from 'elysia'
import { appLog, clearAppLogs, getAppLogs } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { extractSessionToken, isSystemAdmin } from '../../lib/route-helpers'

export function adminLogsRoutes() {
  return (
    new Elysia()

      .get('/api/admin/logs/app', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const url = new URL(request.url)
        const level = url.searchParams.get('level') as any
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
        const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
        return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
      })

      .get('/api/admin/logs/audit', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const url = new URL(request.url)
        const userId = url.searchParams.get('userId')
        const action = url.searchParams.get('action')
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)
        const sinceStr = url.searchParams.get('since')
        const since = sinceStr ? new Date(sinceStr) : null

        const where: Record<string, unknown> = {}
        if (userId) where.userId = userId
        if (action) where.action = action
        if (since && !isNaN(since.getTime())) where.createdAt = { gte: since }

        const [logs, total] = await Promise.all([
          prisma.auditLog.findMany({
            where,
            include: { user: { select: { name: true, email: true, image: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          prisma.auditLog.count({ where }),
        ])
        return { logs, total, limit, offset }
      })

      .delete('/api/admin/logs/app', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        await clearAppLogs()
        appLog('info', 'App logs cleared manually')
        return { ok: true }
      })

      .delete('/api/admin/logs/audit', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const { count } = await prisma.auditLog.deleteMany()
        appLog('info', `Audit logs cleared manually (${count} entries)`)
        return { ok: true, deleted: count }
      })
  )
}
