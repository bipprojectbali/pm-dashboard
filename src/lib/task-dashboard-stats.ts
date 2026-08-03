import { taskVisibilityWhere } from '../routes/tasks/list.helpers'
import { prisma } from './db'

export type TaskDashboardStats = { total: number; open: number; closed: number; overdue: number }

// Total/Open/Closed/Overdue stat cards on the Tasks panel (both the /pm global
// board and a project's Tasks tab). Computed directly in the DB so the numbers
// stay correct beyond the `/api/tasks` 200-row cap — the panel used to derive
// these from `tasks.length` over a capped fetch, silently under-counting once
// a project passed ~200 tasks (same bug class already fixed for Admin
// Analytics and Admin Task Triage). Deliberately does NOT exclude IDEA (unlike
// WORKLOAD_KIND_FILTER-based aggregates) — this card counts every task kind,
// matching the panel's pre-existing behavior. `overdue` uses `dueAt < now`,
// the same definition used by `?overdueOnly` and every other overdue card.
export async function computeTaskDashboardStats(opts: {
  userId: string
  isAdmin: boolean
  projectId?: string
}): Promise<TaskDashboardStats> {
  const { userId, isAdmin, projectId } = opts
  const now = new Date()
  const visibility = await taskVisibilityWhere({ userId, isAdmin })
  const base: Record<string, unknown> = { ...visibility }
  if (projectId) base.projectId = projectId

  const [total, closed, overdue] = await Promise.all([
    prisma.task.count({ where: base }),
    prisma.task.count({ where: { ...base, status: 'CLOSED' } }),
    prisma.task.count({
      where: { ...base, status: { notIn: ['CLOSED'] }, dueAt: { lt: now, not: null } },
    }),
  ])

  return { total, open: total - closed, closed, overdue }
}
