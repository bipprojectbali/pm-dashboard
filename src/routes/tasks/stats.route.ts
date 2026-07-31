import { Elysia } from 'elysia'
import { computeKindBoardStats } from '../../lib/kind-board-stats'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

// Stat-card counts for the Tiket/Pengembangan boards. User-facing (any logged-in
// user); the aggregate is visibility-scoped so a user only counts tasks they may
// see. Kept out of the admin /overview/triage surface because that one is
// admin-only, counts all tasks, and excludes IDEA.
export function taskStatsRoutes() {
  return new Elysia().get('/api/tasks/kind-board-stats', async ({ request, query, set }) => {
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
}
