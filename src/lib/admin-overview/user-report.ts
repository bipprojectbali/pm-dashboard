import { prisma } from '../db'
import { computeActualHours } from '../task-computed'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS } from './shared'

const ESTIMATE_VARIANCE_THRESHOLD = 0.25

export async function computeUserReport(opts: { userId: string; trendDays?: number }) {
  const { userId } = opts
  const trendDays = Math.max(1, Math.min(90, opts.trendDays ?? 14))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const trendStart = new Date(today.getTime() - (trendDays - 1) * DAY_MS)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, image: true, blocked: true },
  })
  if (!user) return null

  const baseWhere = { ...WORKLOAD_KIND_FILTER, assigneeId: userId }

  const [
    statusGroups,
    priorityGroups,
    kindGroups,
    overdueTasks,
    closedTasksForEffort,
    createdTasks,
    closedTasksForTrend,
    githubGroups,
  ] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    prisma.task.groupBy({ by: ['priority'], where: baseWhere, _count: true }),
    prisma.task.groupBy({ by: ['kind'], where: baseWhere, _count: true }),
    prisma.task.findMany({
      where: { ...baseWhere, status: { notIn: ['CLOSED'] }, dueAt: { lt: now, not: null } },
      select: { id: true, title: true, priority: true, status: true, dueAt: true },
      orderBy: { dueAt: 'asc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: { ...baseWhere, status: 'CLOSED' },
      select: { startsAt: true, createdAt: true, closedAt: true, estimateHours: true },
    }),
    prisma.task.findMany({ where: { ...baseWhere, createdAt: { gte: trendStart } }, select: { createdAt: true } }),
    prisma.task.findMany({
      where: { ...baseWhere, status: 'CLOSED', closedAt: { gte: trendStart, not: null } },
      select: { closedAt: true },
    }),
    prisma.projectGithubEvent.groupBy({
      by: ['kind'],
      where: { matchedUserId: userId, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      _count: true,
    }),
  ])

  const blockedCount = await prisma.taskDependency.count({
    where: { task: { ...baseWhere, status: { notIn: ['CLOSED'] } } },
  })

  let sumActualHours = 0
  let sumEstimateHours = 0
  let overCount = 0
  let underCount = 0
  let onCount = 0
  for (const t of closedTasksForEffort) {
    const actual = computeActualHours(t)
    if (actual === null) continue
    sumActualHours += actual
    if (!t.estimateHours) continue
    sumEstimateHours += t.estimateHours
    const variance = (actual - t.estimateHours) / t.estimateHours
    if (variance > ESTIMATE_VARIANCE_THRESHOLD) overCount += 1
    else if (variance < -ESTIMATE_VARIANCE_THRESHOLD) underCount += 1
    else onCount += 1
  }

  const trend: Array<{ date: string; created: number; closed: number }> = []
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart.getTime() + i * DAY_MS)
    trend.push({ date: d.toISOString().slice(0, 10), created: 0, closed: 0 })
  }
  const dayIndex = (d: Date) => {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return Math.round((dd.getTime() - trendStart.getTime()) / DAY_MS)
  }
  for (const t of createdTasks) {
    const i = dayIndex(t.createdAt)
    if (i >= 0 && i < trendDays) trend[i].created += 1
  }
  for (const t of closedTasksForTrend) {
    if (!t.closedAt) continue
    const i = dayIndex(t.closedAt)
    if (i >= 0 && i < trendDays) trend[i].closed += 1
  }

  const total = statusGroups.reduce((sum, g) => sum + g._count, 0)
  const closed = statusGroups.find((g) => g.status === 'CLOSED')?._count ?? 0

  return {
    user,
    total,
    open: total - closed,
    closed,
    overdue: overdueTasks.length,
    blocked: blockedCount,
    byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])),
    byPriority: Object.fromEntries(priorityGroups.map((g) => [g.priority, g._count])),
    byKind: Object.fromEntries(kindGroups.map((g) => [g.kind, g._count])),
    effort: {
      actualHours: Math.round(sumActualHours * 100) / 100,
      estimateHours: Math.round(sumEstimateHours * 100) / 100,
      over: overCount,
      under: underCount,
      on: onCount,
    },
    github7d: Object.fromEntries(githubGroups.map((g) => [g.kind, g._count])),
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt,
    })),
    taskTrend: trend,
  }
}
