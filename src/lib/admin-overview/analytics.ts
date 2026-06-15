import { prisma } from '../db'
import { DAY_MS, daysBetween } from './shared'

export async function computeAnalytics(opts: { timelineLimit?: number; trendDays?: number } = {}) {
  const timelineLimit = opts.timelineLimit ?? 12
  const trendDays = Math.max(1, Math.min(90, opts.trendDays ?? 14))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const trendStart = new Date(today.getTime() - (trendDays - 1) * DAY_MS)
  const in7d = new Date(today.getTime() + 7 * DAY_MS)
  const in30d = new Date(today.getTime() + 30 * DAY_MS)

  const [projectsByStatus, tasksByStatus, timelineProjects, deadlineProjects, createdTasks, closedTasks] =
    await Promise.all([
      prisma.project.groupBy({ by: ['status'], _count: true, where: { archivedAt: null } }),
      prisma.task.groupBy({ by: ['status'], _count: true }),
      prisma.project.findMany({
        where: { archivedAt: null, status: { in: ['ACTIVE', 'ON_HOLD', 'DRAFT'] } },
        select: {
          id: true, name: true, status: true, priority: true, startsAt: true, endsAt: true,
          originalEndAt: true, owner: { select: { email: true } },
        },
        orderBy: [{ endsAt: 'asc' }, { priority: 'desc' }],
        take: timelineLimit,
      }),
      prisma.project.findMany({
        where: { archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, endsAt: { not: null } },
        select: { id: true, name: true, status: true, priority: true, endsAt: true, owner: { select: { email: true } } },
        orderBy: { endsAt: 'asc' },
      }),
      prisma.task.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
      prisma.task.findMany({
        where: { status: 'CLOSED', closedAt: { gte: trendStart, not: null } },
        select: { closedAt: true },
      }),
    ])

  const trend: Array<{ date: string; created: number; closed: number }> = []
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart.getTime() + i * DAY_MS)
    trend.push({ date: d.toISOString().slice(0, 10), created: 0, closed: 0 })
  }
  const dayIndex = (d: Date) => {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return Math.round((dd.getTime() - trendStart.getTime()) / DAY_MS)
  }
  for (const t of createdTasks) { const i = dayIndex(t.createdAt); if (i >= 0 && i < trendDays) trend[i].created += 1 }
  for (const t of closedTasks) {
    if (!t.closedAt) continue
    const i = dayIndex(t.closedAt)
    if (i >= 0 && i < trendDays) trend[i].closed += 1
  }

  const mapProject = (p: { id: string; name: string; status: string; priority: string; endsAt: Date | null; owner: { email: string } }, daysKey: 'daysUntil' | 'daysOverdue', refDate: Date) => ({
    id: p.id, name: p.name, status: p.status, priority: p.priority, owner: p.owner.email, endsAt: p.endsAt,
    [daysKey]: p.endsAt ? daysBetween(p.endsAt, refDate) : null,
  })

  return {
    timestamp: now.toISOString(),
    projectsByStatus: Object.fromEntries(projectsByStatus.map((g) => [g.status, g._count])),
    tasksByStatus: Object.fromEntries(tasksByStatus.map((g) => [g.status, g._count])),
    timeline: timelineProjects.map((p) => ({
      id: p.id, name: p.name, status: p.status, priority: p.priority, owner: p.owner.email,
      startsAt: p.startsAt, endsAt: p.endsAt, originalEndAt: p.originalEndAt,
      slipped: p.endsAt && p.originalEndAt ? p.endsAt.getTime() > p.originalEndAt.getTime() : false,
    })),
    deadlineGroups: {
      endingSoon: deadlineProjects.filter((p) => p.endsAt && p.endsAt >= today && p.endsAt < in7d).map((p) => mapProject(p, 'daysUntil', today)),
      endingMonth: deadlineProjects.filter((p) => p.endsAt && p.endsAt >= in7d && p.endsAt < in30d).map((p) => mapProject(p, 'daysUntil', today)),
      pastDue: deadlineProjects.filter((p) => p.endsAt && p.endsAt < today).map((p) => mapProject(p, 'daysOverdue', p.endsAt!)),
    },
    taskTrend: trend,
  }
}
