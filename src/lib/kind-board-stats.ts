import { taskVisibilityWhere } from '../routes/tasks/list.helpers'
import { prisma } from './db'

const DAY_MS = 24 * 60 * 60 * 1000

export type KindBoardStats = {
  total: number
  overdue: number
  unassigned: number
  blocked: number
  stale: number
  staleDays: number
}

// Stat-card counts for the Tiket/Pengembangan boards (KindBoardPanel). Computed
// directly in the DB so the numbers stay correct beyond any page cap (fixes the
// old client-side-over-200 under-count). Differs from computeTaskTriage (admin):
//   - scoped to ONE kind (the board's kind) — including IDEA, which the admin
//     aggregate deliberately excludes via WORKLOAD_KIND_FILTER.
//   - visibility-scoped to what `auth` may see (same clause as GET /api/tasks),
//     because these boards are user-facing, not admin-only.
// `overdue` uses `dueAt < now` (matching /api/tasks?overdueOnly and the overlay
// card) so every surface agrees.
export async function computeKindBoardStats(opts: {
  userId: string
  isAdmin: boolean
  kind: 'TICKET' | 'IDEA'
  staleDays?: number
}): Promise<KindBoardStats> {
  const { userId, isAdmin, kind, staleDays = 7 } = opts
  const now = new Date()
  const staleBefore = new Date(now.getTime() - staleDays * DAY_MS)

  const visibility = await taskVisibilityWhere({ userId, isAdmin })
  const open = { deletedAt: null, kind, status: { notIn: ['CLOSED' as const] }, ...visibility }

  const [total, overdue, unassigned, blocked, stale] = await Promise.all([
    prisma.task.count({ where: open }),
    prisma.task.count({ where: { ...open, dueAt: { lt: now, not: null } } }),
    prisma.task.count({ where: { ...open, assigneeId: null } }),
    prisma.task.count({ where: { ...open, blockedBy: { some: {} } } }),
    prisma.task.count({ where: { ...open, updatedAt: { lt: staleBefore } } }),
  ])

  return { total, overdue, unassigned, blocked, stale, staleDays }
}
