import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { extractSessionToken, getIp } from '../../lib/route-helpers'
import { importEntities, wipeEntities } from './sync.helpers'

export function adminSyncRoutes() {
  return (
    new Elysia()

      .get('/api/admin/sync/export', async ({ request, set }) => {
        if (!env.MCP_SECRET) {
          set.status = 503
          return { error: 'MCP_SECRET not configured' }
        }
        const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
        if (bearer !== env.MCP_SECRET) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const url = new URL(request.url)
        const requested = new Set(
          (url.searchParams.get('entities') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        )
        const all = requested.size === 0
        const want = (k: string) => all || requested.has(k)

        const result: Record<string, unknown> = {}

        if (want('users')) {
          result.users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, blocked: true, preferences: true, emailVerified: true, image: true, createdAt: true, updatedAt: true },
          })
        }
        if (want('projects')) {
          result.projects = await prisma.project.findMany({ include: { members: true, extensions: true } })
        }
        if (want('tasks')) {
          result.tasks = await prisma.task.findMany({
            include: { tags: { select: { tagId: true } }, checklist: true, comments: true, evidence: true, statusChanges: true, blockedBy: true },
          })
        }
        if (want('tags')) result.tags = await prisma.tag.findMany()
        if (want('milestones')) result.milestones = await prisma.projectMilestone.findMany()

        appLog('info', `Sync export requested (entities: ${[...requested].join(',') || 'all'}) from ${getIp(request)}`)
        return { exportedAt: new Date().toISOString(), entities: result }
      })

      .post('/api/admin/sync/pull', async ({ request, set }) => {
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

        let body: { url?: unknown; token?: unknown; entities?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          set.status = 400
          return { error: 'Invalid JSON' }
        }

        const remoteUrl = typeof body.url === 'string' ? body.url.replace(/\/+$/, '') : ''
        const remoteToken = typeof body.token === 'string' ? body.token.trim() : ''
        const entities: string[] = Array.isArray(body.entities)
          ? body.entities.filter((e): e is string => typeof e === 'string')
          : []

        if (!remoteUrl || !remoteToken) {
          set.status = 400
          return { error: 'url dan token wajib diisi' }
        }

        const exportUrl = `${remoteUrl}/api/admin/sync/export?entities=${entities.join(',')}`
        let exportRes: Response
        try {
          exportRes = await fetch(exportUrl, {
            headers: { Authorization: `Bearer ${remoteToken}` },
            signal: AbortSignal.timeout(60_000),
          })
        } catch (e) {
          set.status = 502
          return { error: `Tidak bisa terhubung ke ${remoteUrl}: ${(e as Error).message}` }
        }
        if (!exportRes.ok) {
          set.status = 502
          return { error: `Remote mengembalikan status ${exportRes.status}` }
        }
        const { entities: data } = (await exportRes.json()) as { exportedAt: string; entities: Record<string, unknown[]> }

        await wipeEntities(entities)
        const summary = await importEntities(data, entities)

        const ip = getIp(request)
        appLog('info', `Sync pull from ${remoteUrl} by userId=${session.user.id} — entities: ${entities.join(',') || 'all'}`, ip)
        await prisma.auditLog
          .create({ data: { userId: session.user.id, action: 'SYNC_FROM_STG', detail: remoteUrl, ip } })
          .catch(() => {})
        return { ok: true, summary }
      })
  )
}
