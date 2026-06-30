import { prisma } from '../db'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS, RiskSeverity, daysBetween } from './shared'

export async function computeRiskReport(opts: { staleDays?: number } = {}) {
  const { staleDays = 3 } = opts
  const now = new Date()
  const staleBefore = new Date(now.getTime() - staleDays * DAY_MS)

  const [overdueTasks, staleTasks, pastDueProjects] = await Promise.all([
    prisma.task.findMany({
      where: { ...WORKLOAD_KIND_FILTER, status: { notIn: ['CLOSED'] }, dueAt: { lt: now, not: null } },
      take: 50,
      orderBy: { dueAt: 'asc' },
      include: {
        assignee: { select: { email: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.task.findMany({
      where: { ...WORKLOAD_KIND_FILTER, status: 'IN_PROGRESS', updatedAt: { lt: staleBefore } },
      take: 50,
      orderBy: { updatedAt: 'asc' },
      include: {
        assignee: { select: { email: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, endsAt: { lt: now, not: null } },
      take: 50,
      orderBy: { endsAt: 'asc' },
      include: { owner: { select: { email: true } } },
    }),
  ])

  const requiredEnv = [
    { key: 'DATABASE_URL', set: !!Bun.env.DATABASE_URL },
    { key: 'REDIS_URL', set: !!Bun.env.REDIS_URL },
    { key: 'GOOGLE_CLIENT_ID', set: !!Bun.env.GOOGLE_CLIENT_ID },
    { key: 'GOOGLE_CLIENT_SECRET', set: !!Bun.env.GOOGLE_CLIENT_SECRET },
  ]
  const missingEnv = requiredEnv.filter((e) => !e.set).map((e) => e.key)

  const severity: RiskSeverity =
    pastDueProjects.length > 0 || missingEnv.length > 0
      ? 'high'
      : overdueTasks.length > 5 || staleTasks.length > 5
        ? 'medium'
        : overdueTasks.length > 0 || staleTasks.length > 0
          ? 'low'
          : 'none'

  return {
    timestamp: now.toISOString(),
    severity,
    summary: {
      overdueTasks: overdueTasks.length,
      staleTasks: staleTasks.length,
      pastDueProjects: pastDueProjects.length,
      missingEnv: missingEnv.length,
    },
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt,
      daysOverdue: t.dueAt ? daysBetween(now, t.dueAt) : null,
      assignee: t.assignee?.email ?? null, project: t.project.name, projectId: t.project.id,
    })),
    staleTasks: staleTasks.map((t) => ({
      id: t.id, title: t.title, priority: t.priority, updatedAt: t.updatedAt,
      daysStale: daysBetween(now, t.updatedAt),
      assignee: t.assignee?.email ?? null, project: t.project.name, projectId: t.project.id,
    })),
    pastDueProjects: pastDueProjects.map((p) => ({
      id: p.id, name: p.name, status: p.status, priority: p.priority, owner: p.owner.email,
      endsAt: p.endsAt, daysOverdue: p.endsAt ? daysBetween(now, p.endsAt) : null,
    })),
    missingEnv,
  }
}
