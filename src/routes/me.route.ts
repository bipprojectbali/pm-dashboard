import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { extractSessionToken, requireAuth } from '../lib/route-helpers'

type PMTab = 'overview' | 'projects' | 'tasks' | 'activity' | 'team'
type TaskDefaultFilter = 'mine' | 'all' | 'priority'
type UserPreferences = {
  notifyTaskAssigned: boolean
  notifyTaskStatusChanged: boolean
  notifyMentioned: boolean
  notifyProjectDeadline: boolean
  pmDefaultTab: PMTab
  tasksDefaultFilter: TaskDefaultFilter
  tableDensity: 'compact' | 'comfortable'
}

function defaultPreferences(): UserPreferences {
  return {
    notifyTaskAssigned: true,
    notifyTaskStatusChanged: true,
    notifyMentioned: true,
    notifyProjectDeadline: true,
    pmDefaultTab: 'overview',
    tasksDefaultFilter: 'mine',
    tableDensity: 'comfortable',
  }
}

function sanitizePreferences(input: Record<string, unknown>): UserPreferences {
  const base = defaultPreferences()
  const pmTabs: PMTab[] = ['overview', 'projects', 'tasks', 'activity', 'team']
  const filters: TaskDefaultFilter[] = ['mine', 'all', 'priority']
  return {
    notifyTaskAssigned:
      typeof input.notifyTaskAssigned === 'boolean' ? input.notifyTaskAssigned : base.notifyTaskAssigned,
    notifyTaskStatusChanged:
      typeof input.notifyTaskStatusChanged === 'boolean' ? input.notifyTaskStatusChanged : base.notifyTaskStatusChanged,
    notifyMentioned: typeof input.notifyMentioned === 'boolean' ? input.notifyMentioned : base.notifyMentioned,
    notifyProjectDeadline:
      typeof input.notifyProjectDeadline === 'boolean' ? input.notifyProjectDeadline : base.notifyProjectDeadline,
    pmDefaultTab: pmTabs.includes(input.pmDefaultTab as PMTab) ? (input.pmDefaultTab as PMTab) : base.pmDefaultTab,
    tasksDefaultFilter: filters.includes(input.tasksDefaultFilter as TaskDefaultFilter)
      ? (input.tasksDefaultFilter as TaskDefaultFilter)
      : base.tasksDefaultFilter,
    tableDensity: input.tableDensity === 'compact' ? 'compact' : 'comfortable',
  }
}

export function meRoutes() {
  return new Elysia()
    // ─── My Agents API (any authenticated user) ────────
    .get('/api/me/agents', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const agents = await prisma.agent.findMany({
        where: { claimedById: auth.userId },
        select: {
          id: true,
          agentId: true,
          hostname: true,
          osUser: true,
          status: true,
          lastSeenAt: true,
          createdAt: true,
          _count: { select: { events: true } },
        },
        orderBy: [{ status: 'asc' }, { lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      })
      return { agents }
    })

    .get('/api/me/agents/today', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const agents = await prisma.agent.findMany({
        where: { claimedById: auth.userId, status: 'APPROVED' },
        select: { id: true, agentId: true, hostname: true },
      })
      if (agents.length === 0) return { totalSeconds: 0, perAgent: [] as { agentId: string; seconds: number }[] }
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const grouped = await prisma.activityEvent.groupBy({
        by: ['agentId'],
        where: {
          agentId: { in: agents.map((a) => a.id) },
          timestamp: { gte: startOfDay },
          bucketId: { contains: 'window' },
        },
        _sum: { duration: true },
      })
      const byAgent = new Map(grouped.map((g) => [g.agentId, g._sum.duration ?? 0] as const))
      const perAgent = agents.map((a) => ({ agentId: a.id, seconds: Math.round(byAgent.get(a.id) ?? 0) }))
      const totalSeconds = perAgent.reduce((sum, p) => sum + p.seconds, 0)
      return { totalSeconds, perAgent }
    })

    // ─── User preferences ────────
    .get('/api/me/preferences', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { preferences: true },
      })
      return { preferences: user?.preferences ?? defaultPreferences() }
    })
    .put('/api/me/preferences', async ({ request, body, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const incoming = (body ?? {}) as Record<string, unknown>
      const merged = sanitizePreferences(incoming)
      await prisma.user.update({
        where: { id: auth.userId },
        data: { preferences: merged },
      })
      return { preferences: merged }
    })

    // ─── Security: password + sessions + audit ────────
    .put('/api/me/password', async ({ request, body, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const { currentPassword, newPassword } = (body ?? {}) as { currentPassword?: string; newPassword?: string }
      if (!currentPassword || !newPassword) {
        set.status = 400
        return { error: 'currentPassword and newPassword required' }
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
      const ok = await Bun.password.verify(currentPassword, user.password)
      if (!ok) {
        set.status = 403
        return { error: 'Password saat ini salah' }
      }
      const hashed = await Bun.password.hash(newPassword)
      await prisma.user.update({ where: { id: auth.userId }, data: { password: hashed } })
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      await prisma.auditLog.create({
        data: { userId: auth.userId, action: 'PASSWORD_CHANGED', detail: null, ip },
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
            in: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'LOGIN_BLOCKED', 'PASSWORD_CHANGED', 'SESSIONS_REVOKED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, detail: true, ip: true, createdAt: true },
      })
      return { logs }
    })

    // ─── Notifications API (authenticated user) ────────
    .get('/api/me/notifications', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const limitRaw = Number(query?.limit ?? 50)
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
      const onlyUnread = query?.unread === '1' || query?.unread === 'true'
      const notifications = await prisma.notification.findMany({
        where: { recipientId: auth.userId, ...(onlyUnread ? { readAt: null } : {}) },
        include: { actor: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      const unreadCount = await prisma.notification.count({
        where: { recipientId: auth.userId, readAt: null },
      })
      return { notifications, unreadCount }
    })

    .get('/api/me/notifications/unread-count', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const unreadCount = await prisma.notification.count({
        where: { recipientId: auth.userId, readAt: null },
      })
      return { unreadCount }
    })

    .post('/api/me/notifications/:id/read', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const n = await prisma.notification.findUnique({ where: { id: params.id } })
      if (!n || n.recipientId !== auth.userId) {
        set.status = 404
        return { error: 'Notification not found' }
      }
      if (n.readAt) return { notification: n }
      const notification = await prisma.notification.update({
        where: { id: params.id },
        data: { readAt: new Date() },
      })
      return { notification }
    })

    .post('/api/me/notifications/read-all', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const result = await prisma.notification.updateMany({
        where: { recipientId: auth.userId, readAt: null },
        data: { readAt: new Date() },
      })
      return { updated: result.count }
    })

    .delete('/api/me/notifications/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const n = await prisma.notification.findUnique({ where: { id: params.id } })
      if (!n || n.recipientId !== auth.userId) {
        set.status = 404
        return { error: 'Notification not found' }
      }
      await prisma.notification.delete({ where: { id: params.id } })
      return { ok: true }
    })

    // ─── Team (user-scoped aggregate across shared projects) ────
    .get('/api/me/team', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        select: { projectId: true, role: true, project: { select: { id: true, name: true } } },
      })
      const projectIds = memberships.map((m) => m.projectId)
      if (projectIds.length === 0) {
        return { teammates: [], projects: [] }
      }
      const myRoleByProject = new Map(memberships.map((m) => [m.projectId, m.role]))
      const allMembers = await prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, blocked: true, image: true } },
          project: { select: { id: true, name: true } },
        },
      })
      type ShareEntry = { projectId: string; projectName: string; myRole: string; theirRole: string }
      type Teammate = {
        id: string
        name: string
        email: string
        role: string
        blocked: boolean
        image: string | null
        sharedProjects: ShareEntry[]
      }
      const teammateMap = new Map<string, Teammate>()
      for (const m of allMembers) {
        if (m.userId === auth.userId) continue
        if (m.user.blocked) continue
        const existing: Teammate = teammateMap.get(m.userId) ?? {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.user.role,
          blocked: m.user.blocked,
          image: m.user.image ?? null,
          sharedProjects: [],
        }
        existing.sharedProjects.push({
          projectId: m.projectId,
          projectName: m.project.name,
          myRole: myRoleByProject.get(m.projectId) ?? 'MEMBER',
          theirRole: m.role,
        })
        teammateMap.set(m.userId, existing)
      }
      const teammateIds = Array.from(teammateMap.keys())
      if (teammateIds.length === 0) {
        return {
          teammates: [],
          projects: memberships.map((m) => ({ id: m.project.id, name: m.project.name, myRole: m.role })),
        }
      }
      const now = new Date()
      const [openCounts, overdueCounts] = await Promise.all([
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            projectId: { in: projectIds },
            assigneeId: { in: teammateIds },
            status: { not: 'CLOSED' },
          },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            projectId: { in: projectIds },
            assigneeId: { in: teammateIds },
            status: { not: 'CLOSED' },
            dueAt: { lt: now },
          },
          _count: { _all: true },
        }),
      ])
      const openByUser = new Map(openCounts.filter((c) => c.assigneeId).map((c) => [c.assigneeId!, c._count._all]))
      const overdueByUser = new Map(
        overdueCounts.filter((c) => c.assigneeId).map((c) => [c.assigneeId!, c._count._all]),
      )
      const teammates = Array.from(teammateMap.values()).map((t) => ({
        ...t,
        openTasks: openByUser.get(t.id) ?? 0,
        overdueTasks: overdueByUser.get(t.id) ?? 0,
      }))
      teammates.sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name))
      return {
        teammates,
        projects: memberships.map((m) => ({ id: m.project.id, name: m.project.name, myRole: m.role })),
      }
    })

    .get('/api/me/team-activity', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const limitRaw = Number(query?.limit ?? 30)
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 30))
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        select: { projectId: true },
      })
      const projectIds = memberships.map((m) => m.projectId)
      if (projectIds.length === 0) {
        return { activity: [] }
      }
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [statusChanges, comments] = await Promise.all([
        prisma.taskStatusChange.findMany({
          where: {
            createdAt: { gte: since },
            task: { projectId: { in: projectIds } },
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
            author: { select: { id: true, name: true, email: true, image: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.taskComment.findMany({
          where: {
            createdAt: { gte: since },
            task: { projectId: { in: projectIds } },
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
            author: { select: { id: true, name: true, email: true, image: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ])
      const items = [
        ...statusChanges.map((s) => ({
          kind: 'STATUS_CHANGE' as const,
          id: `s_${s.id}`,
          createdAt: s.createdAt.toISOString(),
          author: s.author,
          task: { id: s.task.id, title: s.task.title, projectId: s.task.projectId },
          project: s.task.project,
          detail: { fromStatus: s.fromStatus, toStatus: s.toStatus, body: null as string | null },
        })),
        ...comments.map((c) => ({
          kind: 'COMMENT' as const,
          id: `c_${c.id}`,
          createdAt: c.createdAt.toISOString(),
          author: c.author,
          task: { id: c.task.id, title: c.task.title, projectId: c.task.projectId },
          project: c.task.project,
          detail: {
            fromStatus: null as string | null,
            toStatus: null as string | null,
            body: c.body.slice(0, 200),
          },
        })),
      ]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
      return { activity: items }
    })
}
