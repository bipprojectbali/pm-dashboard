import { Elysia } from 'elysia'
import { computeUserReport } from '../../lib/admin-overview'
import { prisma } from '../../lib/db'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function adminReportUserRoutes() {
  return new Elysia().get('/api/admin/report/user', async ({ request, query, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!isSystemAdmin(auth.role)) {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const userId = typeof query.userId === 'string' ? query.userId : ''
    if (!userId) {
      set.status = 400
      return { error: 'userId is required' }
    }
    const now = new Date()
    const defaultSince = new Date(now.getFullYear(), now.getMonth(), 1)
    const since = typeof query.since === 'string' ? new Date(query.since) : defaultSince
    const until = typeof query.until === 'string' ? new Date(query.until) : now
    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || until <= since) {
      set.status = 400
      return { error: 'Invalid since/until' }
    }
    const days = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)))
    const trendDays = Math.min(60, Math.max(7, days))

    const snapshot = await computeUserReport({ userId, trendDays })
    if (!snapshot) {
      set.status = 404
      return { error: 'User not found' }
    }

    const [
      closedInPeriod,
      createdInPeriod,
      commitsInPeriod,
      prsOpenedInPeriod,
      prsMergedInPeriod,
      reviewsInPeriod,
      perProjectGithub,
      auditHighlights,
    ] = await Promise.all([
      prisma.task.count({ where: { assigneeId: userId, status: 'CLOSED', closedAt: { gte: since, lte: until } } }),
      prisma.task.count({ where: { assigneeId: userId, createdAt: { gte: since, lte: until } } }),
      prisma.projectGithubEvent.count({
        where: { matchedUserId: userId, kind: 'PUSH_COMMIT', createdAt: { gte: since, lte: until } },
      }),
      prisma.projectGithubEvent.count({
        where: { matchedUserId: userId, kind: 'PR_OPENED', createdAt: { gte: since, lte: until } },
      }),
      prisma.projectGithubEvent.count({
        where: { matchedUserId: userId, kind: 'PR_MERGED', createdAt: { gte: since, lte: until } },
      }),
      prisma.projectGithubEvent.count({
        where: { matchedUserId: userId, kind: 'PR_REVIEWED', createdAt: { gte: since, lte: until } },
      }),
      prisma.projectGithubEvent.groupBy({
        by: ['projectId', 'kind'],
        where: { matchedUserId: userId, createdAt: { gte: since, lte: until } },
        _count: true,
      }),
      prisma.auditLog.findMany({
        where: {
          userId,
          action: { notIn: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] },
          createdAt: { gte: since, lte: until },
        },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    const projectIds = Array.from(new Set(perProjectGithub.map((g) => g.projectId)))
    const githubProjects =
      projectIds.length > 0
        ? await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true, githubRepo: true },
          })
        : []
    const projectMap = new Map(githubProjects.map((p) => [p.id, p]))
    const githubByProject = projectIds
      .map((id) => {
        const p = projectMap.get(id)
        const entries = perProjectGithub.filter((g) => g.projectId === id)
        const counts: Record<string, number> = {}
        for (const e of entries) counts[e.kind] = e._count
        return {
          projectId: id,
          projectName: p?.name ?? 'Unknown',
          repo: p?.githubRepo ?? null,
          commits: counts.PUSH_COMMIT ?? 0,
          prsOpened: counts.PR_OPENED ?? 0,
          prsMerged: counts.PR_MERGED ?? 0,
          prsClosed: counts.PR_CLOSED ?? 0,
          reviews: counts.PR_REVIEWED ?? 0,
        }
      })
      .sort((a, b) => b.commits + b.prsMerged - (a.commits + a.prsMerged))

    return {
      window: { since, until, days },
      generatedAt: now,
      generatedBy: { email: auth.email },
      user: snapshot.user,
      total: snapshot.total,
      open: snapshot.open,
      closed: snapshot.closed,
      overdue: snapshot.overdue,
      blocked: snapshot.blocked,
      byStatus: snapshot.byStatus,
      byPriority: snapshot.byPriority,
      byKind: snapshot.byKind,
      effort: snapshot.effort,
      overdueTasks: snapshot.overdueTasks,
      taskTrend: snapshot.taskTrend,
      taskSnapshot: { closedInPeriod, createdInPeriod },
      github: {
        commits: commitsInPeriod,
        prsOpened: prsOpenedInPeriod,
        prsMerged: prsMergedInPeriod,
        reviews: reviewsInPeriod,
        byProject: githubByProject,
      },
      audit: auditHighlights.map((a) => ({
        id: a.id,
        action: a.action,
        detail: a.detail,
        ip: a.ip,
        createdAt: a.createdAt,
        userEmail: a.user?.email ?? null,
        userName: a.user?.name ?? null,
      })),
    }
  })
}
