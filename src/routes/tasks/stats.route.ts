import { Elysia } from 'elysia'
import { computeKindBoardStats } from '../../lib/kind-board-stats'
import { computeTaskDashboardStats } from '../../lib/task-dashboard-stats'
import { canReadProject, isSystemAdmin, requireAuth } from '../../lib/route-helpers'

// Stat-card counts for the Tiket/Pengembangan boards. User-facing (any logged-in
// user); the aggregate is visibility-scoped so a user only counts tasks they may
// see. Kept out of the admin /overview/triage surface because that one is
// admin-only, counts all tasks, and excludes IDEA.
export function taskStatsRoutes() {
  return new Elysia()
    .get('/api/tasks/kind-board-stats', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const kind = String(query.kind ?? '').toUpperCase()
      if (kind !== 'TICKET' && kind !== 'IDEA') {
        set.status = 400
        return { error: 'kind must be TICKET or IDEA' }
      }
      const staleDays = Math.min(30, Math.max(1, Number(query.staleDays) || 7))
      return computeKindBoardStats({
        userId: auth.userId,
        isAdmin: isSystemAdmin(auth.role),
        kind,
        staleDays,
      })
    })
    // Total/Open/Closed/Overdue stat cards on the Tasks panel dashboard overlay.
    // Registered before the CRUD `:id` routes (see tasks.route.ts) so the id
    // param never captures this static path.
    .get('/api/tasks/dashboard-stats', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = isSystemAdmin(auth.role)
      const projectId = query.projectId ? String(query.projectId) : undefined
      if (projectId && !isAdmin) {
        const access = await canReadProject(projectId, auth)
        if (!access.ok) {
          set.status = access.status!
          return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
        }
      }
      return computeTaskDashboardStats({ userId: auth.userId, isAdmin, projectId })
    })
}
