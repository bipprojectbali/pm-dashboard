import { prisma } from '../db'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import { DAY_MS } from './shared'

export async function computeTeamLoad(opts: { projectId?: string; includeUnassigned?: boolean; limit?: number } = {}) {
  const { projectId, includeUnassigned = true, limit = 50 } = opts
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * DAY_MS)
  const baseWhere: Record<string, unknown> = { ...WORKLOAD_KIND_FILTER }
  if (projectId) baseWhere.projectId = projectId

  const [openRows, overdueGroups, closedGroups] = await Promise.all([
    prisma.task.findMany({
      where: { ...baseWhere, status: { notIn: ['CLOSED'] } },
      select: { assigneeId: true, estimateHours: true, priority: true },
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...baseWhere, status: { notIn: ['CLOSED'] }, dueAt: { lt: now, not: null } },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...baseWhere, status: 'CLOSED', closedAt: { gte: since7d } },
      _count: true,
    }),
  ])

  type Bucket = { open: number; estimateHours: number; highPriority: number; overdue: number; closed7d: number }
  const bucket = (): Bucket => ({ open: 0, estimateHours: 0, highPriority: 0, overdue: 0, closed7d: 0 })
  const map = new Map<string | null, Bucket>()

  for (const t of openRows) {
    const key = t.assigneeId
    if (!includeUnassigned && !key) continue
    const b = map.get(key) ?? bucket()
    b.open += 1
    if (t.estimateHours) b.estimateHours += t.estimateHours
    if (t.priority === 'HIGH' || t.priority === 'CRITICAL') b.highPriority += 1
    map.set(key, b)
  }
  for (const g of overdueGroups) {
    if (!includeUnassigned && !g.assigneeId) continue
    const b = map.get(g.assigneeId) ?? bucket()
    b.overdue = g._count
    map.set(g.assigneeId, b)
  }
  for (const g of closedGroups) {
    if (!includeUnassigned && !g.assigneeId) continue
    const b = map.get(g.assigneeId) ?? bucket()
    b.closed7d = g._count
    map.set(g.assigneeId, b)
  }

  const userIds = [...map.keys()].filter((k): k is string => k !== null)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, role: true, image: true },
      })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))

  const rows = [...map.entries()].map(([userId, b]) => {
    const u = userId ? userById.get(userId) : null
    const overloaded = b.open >= 10 || b.estimateHours > 80 || b.overdue >= 3
    return {
      userId, email: u?.email ?? null,
      name: u?.name ?? (userId ? '(unknown)' : '(unassigned)'),
      role: u?.role ?? null, image: u?.image ?? null,
      open: b.open, estimateHours: Math.round(b.estimateHours * 10) / 10,
      highPriority: b.highPriority, overdue: b.overdue, closed7d: b.closed7d, overloaded,
    }
  })
  rows.sort((a, b) => b.open - a.open)

  return { count: rows.length, rows: rows.slice(0, limit) }
}
