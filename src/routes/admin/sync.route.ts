import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { extractSessionToken, getIp } from '../../lib/route-helpers'

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

        const want = (k: string) => entities.length === 0 || entities.includes(k)
        const summary: Record<string, number> = {}

        if (want('tasks') || want('projects')) {
          await prisma.taskStatusChange.deleteMany()
          await prisma.taskComment.deleteMany()
          await prisma.taskEvidence.deleteMany()
          await prisma.taskChecklistItem.deleteMany()
          await prisma.taskDependency.deleteMany()
          await prisma.taskTag.deleteMany()
          await prisma.task.deleteMany()
        }
        if (want('tags') || want('projects')) await prisma.tag.deleteMany()
        if (want('projects')) {
          await prisma.projectExtension.deleteMany()
          await prisma.projectMilestone.deleteMany()
          await prisma.projectMember.deleteMany()
          await prisma.projectGithubEvent.deleteMany()
          await prisma.githubWebhookLog.deleteMany()
          await prisma.project.deleteMany()
        }
        if (want('milestones')) await prisma.projectMilestone.deleteMany()
        if (want('users')) {
          await prisma.notification.deleteMany()
          await prisma.auditLog.deleteMany()
          await prisma.session.deleteMany()
          await prisma.account.deleteMany()
          await prisma.user.deleteMany()
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ins = (fn: (a: any) => Promise<unknown>, rows: unknown[]) => fn({ data: rows, skipDuplicates: true })

        if (data.users && want('users')) {
          const rows = (data.users as Array<Record<string, unknown>>).map((u) => ({ ...u, password: '' }))
          await ins(prisma.user.createMany.bind(prisma.user), rows)
          summary.users = rows.length
        }
        if (data.projects && want('projects')) {
          type ProjRow = { members?: unknown; extensions?: unknown; [k: string]: unknown }
          const projects = (data.projects as ProjRow[]).map(({ members: _m, extensions: _e, ...p }) => p)
          await ins(prisma.project.createMany.bind(prisma.project), projects)
          summary.projects = projects.length
          const members = (data.projects as ProjRow[]).flatMap((p) => (p.members as unknown[] | undefined) ?? [])
          if (members.length) await ins(prisma.projectMember.createMany.bind(prisma.projectMember), members)
          const exts = (data.projects as ProjRow[]).flatMap((p) => (p.extensions as unknown[] | undefined) ?? [])
          if (exts.length) await ins(prisma.projectExtension.createMany.bind(prisma.projectExtension), exts)
        }
        if (data.tags && want('tags')) {
          await ins(prisma.tag.createMany.bind(prisma.tag), data.tags as unknown[])
          summary.tags = (data.tags as unknown[]).length
        }
        if (data.milestones && want('milestones')) {
          await ins(prisma.projectMilestone.createMany.bind(prisma.projectMilestone), data.milestones as unknown[])
          summary.milestones = (data.milestones as unknown[]).length
        }
        if (data.tasks && want('tasks')) {
          type TaskRow = { tags?: unknown; checklist?: unknown; comments?: unknown; evidence?: unknown; statusChanges?: unknown; blockedBy?: unknown; [k: string]: unknown }
          const tasks = (data.tasks as TaskRow[]).map(
            ({ tags: _t, checklist: _c, comments: _cm, evidence: _e, statusChanges: _s, blockedBy: _b, ...t }) => t,
          )
          await ins(prisma.task.createMany.bind(prisma.task), tasks)
          summary.tasks = tasks.length
          const taskTags = (data.tasks as TaskRow[]).flatMap((t) =>
            ((t.tags as Array<{ tagId: string }> | undefined) ?? []).map((tt) => ({ taskId: t.id as string, tagId: tt.tagId })),
          )
          if (taskTags.length) await ins(prisma.taskTag.createMany.bind(prisma.taskTag), taskTags)
          const checklists = (data.tasks as TaskRow[]).flatMap((t) => (t.checklist as unknown[] | undefined) ?? [])
          if (checklists.length) await ins(prisma.taskChecklistItem.createMany.bind(prisma.taskChecklistItem), checklists)
          const comments = (data.tasks as TaskRow[]).flatMap((t) => (t.comments as unknown[] | undefined) ?? [])
          if (comments.length) await ins(prisma.taskComment.createMany.bind(prisma.taskComment), comments)
          const evidence = (data.tasks as TaskRow[]).flatMap((t) => (t.evidence as unknown[] | undefined) ?? [])
          if (evidence.length) await ins(prisma.taskEvidence.createMany.bind(prisma.taskEvidence), evidence)
          const statusChanges = (data.tasks as TaskRow[]).flatMap((t) => (t.statusChanges as unknown[] | undefined) ?? [])
          if (statusChanges.length) await ins(prisma.taskStatusChange.createMany.bind(prisma.taskStatusChange), statusChanges)
          const deps = (data.tasks as TaskRow[]).flatMap((t) => (t.blockedBy as unknown[] | undefined) ?? [])
          if (deps.length) await ins(prisma.taskDependency.createMany.bind(prisma.taskDependency), deps)
        }

        const ip = getIp(request)
        appLog('info', `Sync pull from ${remoteUrl} by userId=${session.user.id} — entities: ${entities.join(',') || 'all'}`, ip)
        await prisma.auditLog
          .create({ data: { userId: session.user.id, action: 'SYNC_FROM_STG', detail: remoteUrl, ip } })
          .catch(() => {})
        return { ok: true, summary }
      })
  )
}
