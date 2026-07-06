import { prisma } from '../db'
import { ACTIVE_TASK_FILTER, WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS, daysBetween } from './shared'

export interface ProjectHealthRow {
  id: string
  name: string
  status: string
  priority: string
  owner: string
  endsAt: Date | null
  daysUntilDue: number | null
  pastDue: boolean
  counts: { tasks: number; members: number; extensions: number }
  taskStatus: Record<string, number>
  openTasks: number
  overdueTasks: number
  blockedTasks: number
  closed7d: number
  extensions: number
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
}

export async function computeProjectHealth(
  opts: { projectId?: string; includeArchived?: boolean; limit?: number } = {},
) {
  const { projectId, includeArchived = false, limit = 50 } = opts
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * DAY_MS)
  const projectWhere: Record<string, unknown> = {}
  if (projectId) projectWhere.id = projectId
  if (!includeArchived) projectWhere.archivedAt = null

  const projects = await prisma.project.findMany({
    where: projectWhere,
    include: {
      owner: { select: { email: true, name: true } },
      // Filtered relation count — the soft-delete extension doesn't touch
      // relation counts, so exclude trashed tasks here explicitly.
      _count: { select: { tasks: { where: { deletedAt: null } }, members: true, extensions: true } },
    },
    orderBy: [{ priority: 'desc' }, { endsAt: 'asc' }],
    take: limit,
  })
  if (projects.length === 0) return { count: 0, projects: [] as ProjectHealthRow[] }

  const ids = projects.map((p) => p.id)
  const [statusGroups, overdueGroups, closedGroups, blockedRaw] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { ...WORKLOAD_KIND_FILTER, projectId: { in: ids } },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: {
        ...WORKLOAD_KIND_FILTER,
        projectId: { in: ids },
        status: { notIn: ['CLOSED'] },
        dueAt: { lt: now, not: null },
      },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { ...WORKLOAD_KIND_FILTER, projectId: { in: ids }, status: 'CLOSED', closedAt: { gte: since7d } },
      _count: true,
    }),
    prisma.taskDependency.findMany({
      // `task` is a relation here, so the soft-delete extension can't reach it —
      // use ACTIVE_TASK_FILTER (includes deletedAt: null) explicitly.
      where: { task: { ...ACTIVE_TASK_FILTER, projectId: { in: ids }, status: { notIn: ['CLOSED'] } } },
      select: { task: { select: { projectId: true } } },
    }),
  ])

  const byProject = new Map<
    string,
    { status: Record<string, number>; overdue: number; closed7d: number; blocked: number }
  >()
  for (const p of projects) byProject.set(p.id, { status: {}, overdue: 0, closed7d: 0, blocked: 0 })
  for (const s of statusGroups) {
    const b = byProject.get(s.projectId)
    if (b) b.status[s.status] = s._count
  }
  for (const o of overdueGroups) {
    const b = byProject.get(o.projectId)
    if (b) b.overdue = o._count
  }
  for (const c of closedGroups) {
    const b = byProject.get(c.projectId)
    if (b) b.closed7d = c._count
  }
  for (const d of blockedRaw) {
    const b = byProject.get(d.task.projectId)
    if (b) b.blocked += 1
  }

  const results: ProjectHealthRow[] = projects.map((p) => {
    const bucket = byProject.get(p.id)!
    const openTotal = Object.entries(bucket.status)
      .filter(([k]) => k !== 'CLOSED')
      .reduce((n, [, v]) => n + v, 0)
    const daysUntilDue = p.endsAt ? daysBetween(p.endsAt, now) : null
    const pastDue = p.endsAt ? p.endsAt.getTime() < now.getTime() && p.status !== 'COMPLETED' : false
    const extensions = p._count.extensions
    let score = 100
    if (pastDue) score -= 35
    if (bucket.overdue > 0) score -= Math.min(25, bucket.overdue * 5)
    if (bucket.blocked > 0) score -= Math.min(15, bucket.blocked * 3)
    if (extensions > 2) score -= 10
    if (extensions > 4) score -= 5
    if (openTotal > 0 && bucket.closed7d === 0 && p.status === 'ACTIVE') score -= 10
    score = Math.max(0, Math.min(100, score))
    const grade =
      score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : score >= 30 ? 'E' : 'F'
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      owner: p.owner.email,
      endsAt: p.endsAt,
      daysUntilDue,
      pastDue,
      counts: p._count,
      taskStatus: bucket.status,
      openTasks: openTotal,
      overdueTasks: bucket.overdue,
      blockedTasks: bucket.blocked,
      closed7d: bucket.closed7d,
      extensions,
      score,
      grade,
    }
  })

  results.sort((a, b) => a.score - b.score)
  return { count: results.length, projects: results }
}
