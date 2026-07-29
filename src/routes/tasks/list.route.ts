import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import {
  canReadProject,
  computeActualHours,
  computeProgressPercent,
  isSystemAdmin,
  requireAuth,
} from '../../lib/route-helpers'

export function taskListRoutes() {
  return new Elysia().get('/api/tasks', async ({ request, query, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const isAdmin = isSystemAdmin(auth.role)
    const myProjectIds = (
      await prisma.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })
    ).map((m) => m.projectId)
    const visibilityFilter = isAdmin
      ? {}
      : {
          project: {
            OR: [
              { id: { in: myProjectIds } },
              { visibility: 'INTERNAL' as const },
              { visibility: 'PUBLIC' as const },
            ],
          },
        }
    const where: Record<string, unknown> = { deletedAt: null, ...visibilityFilter }
    if (query.projectId) {
      if (!isAdmin) {
        const access = await canReadProject(String(query.projectId), auth)
        if (!access.ok) {
          set.status = access.status!
          return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
        }
      }
      where.projectId = String(query.projectId)
      delete where.project
    }
    const TASK_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] as const
    const TASK_KIND_VALUES = ['TASK', 'BUG', 'QC', 'TICKET', 'IDEA'] as const
    if (query.status) {
      const s = String(query.status)
      if (!(TASK_STATUS_VALUES as readonly string[]).includes(s)) {
        set.status = 400
        return { error: `status must be one of: ${TASK_STATUS_VALUES.join(', ')}` }
      }
      where.status = s
    }
    if (query.kind) {
      const k = String(query.kind)
      if (!(TASK_KIND_VALUES as readonly string[]).includes(k)) {
        set.status = 400
        return { error: `kind must be one of: ${TASK_KIND_VALUES.join(', ')}` }
      }
      where.kind = k
    }
    if (query.assigneeId) where.assigneeId = String(query.assigneeId)
    if (query.mine === '1') where.assigneeId = auth.userId
    if (query.tagId) where.tags = { some: { tagId: String(query.tagId) } }
    const TASK_PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
    if (query.priority) {
      const p = String(query.priority).toUpperCase()
      if (!(TASK_PRIORITY_VALUES as readonly string[]).includes(p)) {
        set.status = 400
        return { error: `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}` }
      }
      where.priority = p
    }
    if (query.search) {
      const s = String(query.search)
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ]
    }
    if (query.overdueOnly === '1') {
      where.dueAt = { lt: new Date() }
      if (!where.status) where.status = { notIn: ['CLOSED'] }
    }
    if (query.unassigned === '1') where.assigneeId = null
    if (query.noDue === '1') where.dueAt = null
    if (query.blocked === '1') where.blockedBy = { some: {} }
    if (query.phaseId) {
      where.phaseId = query.phaseId === 'none' ? null : String(query.phaseId)
    }
    const limit = Math.min(Number(query.limit) || 50, 200)
    const offset = Math.max(0, Number(query.offset) || 0)
    const taskInclude = {
      project: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
      assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
      phase: { select: { id: true, title: true } },
      tags: { include: { tag: true } },
      checklist: { select: { done: true } },
      blockedBy: { select: { blockedById: true } },
      _count: { select: { comments: true, evidence: true, blockedBy: true, blocks: true } },
    } as const
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: taskInclude,
        // status:asc follows the TaskStatus enum definition order (OPEN … CLOSED
        // last), so when a caller truncates via `limit` the still-open tasks come
        // first and CLOSED rows fall off the tail. The Admin Task Triage table
        // relies on this to stay useful under the 200-row cap — keep CLOSED last
        // in the enum (tests/integration/tasks-list-order.test.ts locks it).
        orderBy: [{ status: 'asc' }, { kanbanOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ])
    const enriched = tasks.map((t) => ({
      ...t,
      actualHours: computeActualHours(t),
      progressPercent: computeProgressPercent(t),
    }))
    return { tasks: enriched, total, limit, offset }
  })
}
