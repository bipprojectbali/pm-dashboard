import { Elysia } from 'elysia'
import {
  computeAdminOverview,
  computeAnalytics,
  computeProjectHealth,
  computeRiskReport,
  computeTeamLoad,
} from '../../lib/admin-overview'
import { prisma } from '../../lib/db'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function adminReportRoutes() {
  return (
    new Elysia()

      .get('/api/admin/report', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
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

        const [
          kpis, health, risks, load, analytics,
          priorityGroups, commitsInPeriod, prsOpenedInPeriod,
          prsMergedInPeriod, reviewsInPeriod, perProjectGithub,
          closedInPeriod, createdInPeriod, auditHighlights,
        ] = await Promise.all([
          computeAdminOverview({ recentAuditLimit: 0 }),
          computeProjectHealth({ limit: 200 }),
          computeRiskReport({}),
          computeTeamLoad({ limit: 200 }),
          computeAnalytics({ trendDays, timelineLimit: 50 }),
          prisma.task.groupBy({ by: ['priority'], _count: true }),
          prisma.projectGithubEvent.count({ where: { kind: 'PUSH_COMMIT', createdAt: { gte: since, lte: until } } }),
          prisma.projectGithubEvent.count({ where: { kind: 'PR_OPENED', createdAt: { gte: since, lte: until } } }),
          prisma.projectGithubEvent.count({ where: { kind: 'PR_MERGED', createdAt: { gte: since, lte: until } } }),
          prisma.projectGithubEvent.count({ where: { kind: 'PR_REVIEWED', createdAt: { gte: since, lte: until } } }),
          prisma.projectGithubEvent.groupBy({ by: ['projectId', 'kind'], where: { createdAt: { gte: since, lte: until } }, _count: true }),
          prisma.task.count({ where: { status: 'CLOSED', closedAt: { gte: since, lte: until } } }),
          prisma.task.count({ where: { createdAt: { gte: since, lte: until } } }),
          prisma.auditLog.findMany({
            where: { action: { notIn: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] }, createdAt: { gte: since, lte: until } },
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

        const avgHealthScore =
          health.projects.length > 0
            ? Math.round(health.projects.reduce((s, p) => s + p.score, 0) / health.projects.length)
            : null

        return {
          window: { since, until, days },
          generatedAt: now,
          generatedBy: { email: auth.email },
          kpis, health, risks, load, analytics,
          priorityGroups: priorityGroups.map((g) => ({ priority: g.priority, count: g._count })),
          taskSnapshot: { closedInPeriod, createdInPeriod, avgHealthScore },
          github: { commits: commitsInPeriod, prsOpened: prsOpenedInPeriod, prsMerged: prsMergedInPeriod, reviews: reviewsInPeriod, byProject: githubByProject },
          audit: auditHighlights.map((a) => ({ id: a.id, action: a.action, detail: a.detail, ip: a.ip, createdAt: a.createdAt, userEmail: a.user?.email ?? null, userName: a.user?.name ?? null })),
        }
      })
  )
}
