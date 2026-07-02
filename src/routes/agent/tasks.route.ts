import { Elysia } from 'elysia'
import { resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import {
  isValidKind,
  isValidPriority,
  isValidStatus,
  TASK_KIND_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
} from '../../lib/task-enums'
import { deny, enrich, LIST_INCLUDE, ownedTask } from './shared'

// Shape the status groupBy into named buckets (mirror projects buildTaskStats).
function buildStatusStats(s: Record<string, number>) {
  return {
    open: s.OPEN ?? 0,
    inProgress: s.IN_PROGRESS ?? 0,
    readyForQc: s.READY_FOR_QC ?? 0,
    reopened: s.REOPENED ?? 0,
    closed: s.CLOSED ?? 0,
    total: (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
  }
}

// GET read routes for the token-scoped agent surface: list (paginated), stats, detail.
export function agentTaskReadRoutes() {
  return (
    new Elysia()
      .get('/api/agent/tasks', async ({ request, query, set }) => {
        const auth = await resolveAgentAuth(request)
        if (!auth.ok) return deny(set, auth.status, auth.error)
        const where: Record<string, unknown> = { projectId: auth.projectId, deletedAt: null }
        if (query.status) {
          const s = String(query.status).toUpperCase()
          if (!isValidStatus(s)) return deny(set, 400, `status must be one of: ${TASK_STATUS_VALUES.join(', ')}`)
          where.status = s
        }
        if (query.kind) {
          const k = String(query.kind).toUpperCase()
          if (!isValidKind(k)) return deny(set, 400, `kind must be one of: ${TASK_KIND_VALUES.join(', ')}`)
          where.kind = k
        }
        if (query.priority) {
          const p = String(query.priority).toUpperCase()
          if (!isValidPriority(p)) return deny(set, 400, `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}`)
          where.priority = p
        }
        if (query.assigneeEmail) {
          const u = await prisma.user.findUnique({
            where: { email: String(query.assigneeEmail) },
            select: { id: true },
          })
          where.assigneeId = u?.id ?? '__none__'
        }
        if (query.search) {
          const q = String(query.search)
          where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ]
        }
        const page = Math.max(1, Number(query.page) || 1)
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
        const [total, tasks] = await prisma.$transaction([
          prisma.task.count({ where }),
          prisma.task.findMany({
            where,
            include: LIST_INCLUDE,
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
          }),
        ])
        return {
          count: tasks.length,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          tasks: tasks.map(enrich),
        }
      })

      // Aggregate counts for the token's project. Mounted BEFORE /tasks/:id so
      // "stats" resolves as a static path, not a task id.
      .get('/api/agent/tasks/stats', async ({ request, set }) => {
        const auth = await resolveAgentAuth(request)
        if (!auth.ok) return deny(set, auth.status, auth.error)
        const where = { projectId: auth.projectId, deletedAt: null }
        // No WORKLOAD_KIND_FILTER: an agent asking "how many tasks" wants the true
        // total incl. IDEA; byKind surfaces IDEA separately so it stays visible.
        const [byStatusRows, byPriorityRows, byKindRows] = await prisma.$transaction([
          prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
          prisma.task.groupBy({ by: ['priority'], where, _count: { _all: true } }),
          prisma.task.groupBy({ by: ['kind'], where, _count: { _all: true } }),
        ])
        const statusCounts: Record<string, number> = {}
        for (const r of byStatusRows) statusCounts[r.status] = r._count._all
        const byPriority: Record<string, number> = {}
        for (const p of TASK_PRIORITY_VALUES) byPriority[p] = 0
        for (const r of byPriorityRows) byPriority[r.priority] = r._count._all
        const byKind: Record<string, number> = {}
        for (const k of TASK_KIND_VALUES) byKind[k] = 0
        for (const r of byKindRows) byKind[r.kind] = r._count._all
        const byStatus = buildStatusStats(statusCounts)
        return { total: byStatus.total, byStatus, byPriority, byKind }
      })

      .get('/api/agent/tasks/:id', async ({ request, params, set }) => {
        const auth = await resolveAgentAuth(request)
        if (!auth.ok) return deny(set, auth.status, auth.error)
        const task = await ownedTask(params.id, auth.projectId, true)
        if (!task) return deny(set, 404, 'Task not found')
        return { task: enrich(task) }
      })
  )
}
