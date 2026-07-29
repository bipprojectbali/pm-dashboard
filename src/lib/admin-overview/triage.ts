import { prisma } from '../db'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS } from './shared'

// Counts backing the Admin "Task Triage" stat cards. Computed directly in the
// DB (not client-side over a capped `/api/tasks` page) so the numbers stay
// correct no matter how many tasks exist, and they exclude IDEA via
// WORKLOAD_KIND_FILTER — same convention as every other workload aggregate
// (health/load/risk). `overdue` uses the same "open + dueAt in the past"
// definition as computeRiskReport so the sidebar badge and this card agree.
// `staleDays` is the "no movement" window for open tasks (default 7).
export async function computeTaskTriage(opts: { projectId?: string; staleDays?: number } = {}) {
  const { projectId, staleDays = 7 } = opts
  const now = new Date()
  const staleBefore = new Date(now.getTime() - staleDays * DAY_MS)

  const base: Record<string, unknown> = { ...WORKLOAD_KIND_FILTER }
  if (projectId) base.projectId = projectId
  const open = { ...base, status: { notIn: ['CLOSED' as const] } }

  const [total, overdue, unassigned, blocked, stale] = await Promise.all([
    prisma.task.count({ where: open }),
    prisma.task.count({ where: { ...open, dueAt: { lt: now, not: null } } }),
    prisma.task.count({ where: { ...open, assigneeId: null } }),
    prisma.task.count({ where: { ...open, blockedBy: { some: {} } } }),
    prisma.task.count({ where: { ...open, updatedAt: { lt: staleBefore } } }),
  ])

  return { total, overdue, unassigned, blocked, stale, staleDays }
}
