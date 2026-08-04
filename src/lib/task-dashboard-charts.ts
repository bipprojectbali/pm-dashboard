import { taskVisibilityWhere } from '../routes/tasks/list.helpers'
import { DAY_MS } from './admin-overview/shared'
import { prisma } from './db'

export type TaskDashboardCharts = {
  throughput: Array<{ date: string; created: number; closed: number }>
  statusBreakdown: Record<string, number>
  topAssignees: Array<{ id: string; name: string; count: number }>
}

const TOP_ASSIGNEES_LIMIT = 8

// Throughput / Status breakdown / Top assignees charts on the Tasks panel
// dashboard overlay. Computed directly in the DB so they stay correct beyond
// the `/api/tasks` 200-row cap the overlay used to derive them from — same
// bug class already fixed for the stat cards above them (see
// task-dashboard-stats.ts) and for Admin Analytics (admin-overview/analytics.ts).
// Deliberately does NOT exclude IDEA (unlike WORKLOAD_KIND_FILTER-based
// aggregates): these charts sit directly under stat cards that already
// include every kind, so excluding IDEA here would make the donut total
// disagree with the "Total" card above it.
export async function computeTaskDashboardCharts(opts: {
  userId: string
  isAdmin: boolean
  projectId?: string
  trendDays?: number
}): Promise<TaskDashboardCharts> {
  const { userId, isAdmin, projectId } = opts
  const trendDays = Math.max(1, Math.min(90, opts.trendDays ?? 14))
  const visibility = await taskVisibilityWhere({ userId, isAdmin })
  const base: Record<string, unknown> = { ...visibility }
  if (projectId) base.projectId = projectId

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const trendStart = new Date(today.getTime() - (trendDays - 1) * DAY_MS)

  const [statusGroups, createdRows, closedRows, assigneeGroups] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], _count: true, where: base }),
    prisma.task.findMany({ where: { ...base, createdAt: { gte: trendStart } }, select: { createdAt: true } }),
    prisma.task.findMany({
      where: { ...base, status: 'CLOSED', closedAt: { gte: trendStart, not: null } },
      select: { closedAt: true },
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...base, status: { notIn: ['CLOSED'] }, assigneeId: { not: null } },
      _count: true,
      orderBy: { _count: { assigneeId: 'desc' } },
      take: TOP_ASSIGNEES_LIMIT,
    }),
  ])

  const throughput: Array<{ date: string; created: number; closed: number }> = []
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart.getTime() + i * DAY_MS)
    throughput.push({ date: d.toISOString().slice(0, 10), created: 0, closed: 0 })
  }
  const dayIndex = (d: Date) => {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return Math.round((dd.getTime() - trendStart.getTime()) / DAY_MS)
  }
  for (const t of createdRows) {
    const i = dayIndex(t.createdAt)
    if (i >= 0 && i < trendDays) throughput[i].created += 1
  }
  for (const t of closedRows) {
    if (!t.closedAt) continue
    const i = dayIndex(t.closedAt)
    if (i >= 0 && i < trendDays) throughput[i].closed += 1
  }

  const assigneeIds = assigneeGroups.map((g) => g.assigneeId).filter((id): id is string => id !== null)
  const users = assigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const topAssignees = assigneeGroups
    .filter((g) => g.assigneeId !== null)
    .map((g) => ({
      id: g.assigneeId as string,
      name: nameById.get(g.assigneeId as string) ?? 'Unknown',
      count: g._count,
    }))

  return {
    throughput,
    statusBreakdown: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])),
    topAssignees,
  }
}
