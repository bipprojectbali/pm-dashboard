import { prisma } from '../db'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS, STALE_IN_PROGRESS_MS } from './shared'

export async function computeAdminOverview(opts: { recentAuditLimit?: number } = {}) {
  const recentAuditLimit = opts.recentAuditLimit ?? 8
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * DAY_MS)

  const [
    userCount,
    blockedCount,
    roleGroups,
    projectCount,
    projectsByStatus,
    taskCount,
    tasksByStatus,
    overdueOpen,
    staleInProgress,
    closed7d,
    extensions7d,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { blocked: true } }),
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.project.count({ where: { archivedAt: null } }),
    prisma.project.groupBy({ by: ['status'], _count: true, where: { archivedAt: null } }),
    prisma.task.count({ where: { ...WORKLOAD_KIND_FILTER } }),
    prisma.task.groupBy({ by: ['status'], _count: true, where: { ...WORKLOAD_KIND_FILTER } }),
    prisma.task.count({ where: { ...WORKLOAD_KIND_FILTER, status: { notIn: ['CLOSED'] }, dueAt: { lt: now, not: null } } }),
    prisma.task.count({
      where: { ...WORKLOAD_KIND_FILTER, status: 'IN_PROGRESS', updatedAt: { lt: new Date(now.getTime() - STALE_IN_PROGRESS_MS) } },
    }),
    prisma.task.count({ where: { ...WORKLOAD_KIND_FILTER, status: 'CLOSED', closedAt: { gte: since7d } } }),
    prisma.projectExtension.count({ where: { createdAt: { gte: since7d } } }),
    recentAuditLimit > 0
      ? prisma.auditLog.findMany({
          take: recentAuditLimit,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true, image: true } } },
        })
      : Promise.resolve([]),
  ])

  return {
    timestamp: now.toISOString(),
    users: {
      total: userCount,
      blocked: blockedCount,
      byRole: Object.fromEntries(roleGroups.map((g) => [g.role, g._count])),
    },
    projects: {
      active: projectCount,
      byStatus: Object.fromEntries(projectsByStatus.map((g) => [g.status, g._count])),
    },
    tasks: {
      total: taskCount,
      byStatus: Object.fromEntries(tasksByStatus.map((g) => [g.status, g._count])),
      overdueOpen,
      staleInProgress,
      closed7d,
    },
    velocity: { closed7d, extensions7d },
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      userEmail: a.user?.email ?? null,
      createdAt: a.createdAt,
    })),
  }
}
