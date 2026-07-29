import { Elysia } from 'elysia'
import {
  computeAdminOverview,
  computeAnalytics,
  computeProjectHealth,
  computeRiskReport,
  computeTaskTriage,
  computeTeamLoad,
} from '../../lib/admin-overview'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function adminOverviewRoutes() {
  return (
    new Elysia()

      .get('/api/admin/overview/risks', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const staleDays = Math.min(30, Math.max(1, Number(query.staleDays) || 3))
        return computeRiskReport({ staleDays })
      })

      .get('/api/admin/overview/triage', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
        const staleDays = Math.min(30, Math.max(1, Number(query.staleDays) || 7))
        return computeTaskTriage({ projectId, staleDays })
      })

      .get('/api/admin/overview/health', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
        const includeArchived = query.includeArchived === 'true'
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
        return computeProjectHealth({ projectId, includeArchived, limit })
      })

      .get('/api/admin/overview/load', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const projectId = typeof query.projectId === 'string' ? query.projectId : undefined
        const includeUnassigned = query.includeUnassigned !== 'false'
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
        return computeTeamLoad({ projectId, includeUnassigned, limit })
      })

      .get('/api/admin/overview/kpis', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const recentAuditLimit = Math.min(50, Math.max(0, Number(query.recentAuditLimit) || 8))
        return computeAdminOverview({ recentAuditLimit })
      })

      .get('/api/admin/overview/analytics', async ({ request, query, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (!isSystemAdmin(auth.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const timelineLimit = Math.min(50, Math.max(1, Number(query.timelineLimit) || 12))
        // Cap matches computeAnalytics' own Math.min(90) and the Analytics tab's
        // "90 hari" window option — anything lower silently shrinks the 90d view.
        const trendDays = Math.min(90, Math.max(1, Number(query.trendDays) || 14))
        return computeAnalytics({ timelineLimit, trendDays })
      })
  )
}
