import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getAllowedTaskTransitions, getIp, writeAuditLog } from '../../lib/route-helpers'
import { deny, enrich, ownedTask, type Status, TASK_INCLUDE } from './shared'

// Task CRUD for the token-only agent REST surface. Every route is scoped to the
// token's project; agents never pass projectId.
export function agentTaskRoutes() {
  return new Elysia()
    .get('/api/agent/tasks', async ({ request, query, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      const where: Record<string, unknown> = { projectId: auth.projectId, deletedAt: null }
      if (query.status) where.status = String(query.status)
      if (query.kind) where.kind = String(query.kind)
      if (query.assigneeEmail) {
        const u = await prisma.user.findUnique({
          where: { email: String(query.assigneeEmail) },
          select: { id: true },
        })
        where.assigneeId = u?.id ?? '__none__'
      }
      const limit = Math.min(Number(query.limit) || 50, 200)
      const tasks = await prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      })
      return { count: tasks.length, tasks: tasks.map(enrich) }
    })

    .get('/api/agent/tasks/:id', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      const task = await ownedTask(params.id, auth.projectId)
      if (!task) return deny(set, 404, 'Task not found')
      return { task: enrich(task) }
    })

    .post('/api/agent/tasks', async ({ request, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const body = (await request.json()) as {
        title?: string
        description?: string
        kind?: string
        priority?: string
        assigneeEmail?: string
        dueAt?: string
        estimateHours?: number
      }
      if (!body.title?.trim() || !body.description?.trim()) return deny(set, 400, 'title, description wajib diisi')
      if (body.kind === 'IDEA') return deny(set, 403, 'IDEA is read-only via access token')
      let assigneeId: string | null = null
      if (body.assigneeEmail) {
        const a = await prisma.user.findUnique({ where: { email: body.assigneeEmail }, select: { id: true } })
        if (!a) return deny(set, 400, `Assignee not found: ${body.assigneeEmail}`)
        assigneeId = a.id
      }
      const reporterId = await resolveReporterId(auth.projectId, auth.userId)
      const task = await prisma.task.create({
        data: {
          projectId: auth.projectId, // forced from token, ignore any client value
          title: body.title.trim(),
          description: body.description.trim(),
          kind: (body.kind as 'TASK' | 'BUG' | 'QC' | 'TICKET') ?? 'TASK',
          priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          reporterId,
          assigneeId,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          estimateHours: typeof body.estimateHours === 'number' ? body.estimateHours : null,
        },
        include: TASK_INCLUDE,
      })
      writeAuditLog(auth.userId, 'AGENT_TASK_CREATED', `#${task.id} ${task.title}`, getIp(request))
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { task: enrich(task) }
    })

    .patch('/api/agent/tasks/:id', async ({ request, params, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const current = await ownedTask(params.id, auth.projectId)
      if (!current) return deny(set, 404, 'Task not found')
      if (current.kind === 'IDEA') return deny(set, 403, 'IDEA is read-only via access token')
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: string
        status?: string
        assigneeEmail?: string | null
        dueAt?: string | null
        estimateHours?: number | null
        progressPercent?: number | null
      }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (body.priority !== undefined) data.priority = body.priority
      if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
      if (body.estimateHours !== undefined) data.estimateHours = body.estimateHours
      if (body.progressPercent !== undefined)
        data.progressPercent =
          body.progressPercent === null ? null : Math.max(0, Math.min(100, Math.round(body.progressPercent)))
      if (body.assigneeEmail !== undefined) {
        if (body.assigneeEmail === null) data.assigneeId = null
        else {
          const a = await prisma.user.findUnique({ where: { email: body.assigneeEmail }, select: { id: true } })
          if (!a) return deny(set, 400, `Assignee not found: ${body.assigneeEmail}`)
          data.assigneeId = a.id
        }
      }
      let transition: { from: Status; to: Status } | null = null
      if (body.status !== undefined && body.status !== current.status) {
        const allowed = getAllowedTaskTransitions(current.status, current.kind)
        if (!allowed.includes(body.status))
          return deny(set, 400, `Invalid transition: ${current.status} → ${body.status}`)
        transition = { from: current.status as Status, to: body.status as Status }
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (body.status === 'REOPENED') data.closedAt = null
      }
      const task = await prisma.task.update({ where: { id: params.id }, data, include: TASK_INCLUDE })
      if (transition) {
        const authorId = await resolveReporterId(auth.projectId, auth.userId)
        await prisma.taskStatusChange.create({
          data: { taskId: task.id, authorId, fromStatus: transition.from, toStatus: transition.to },
        })
      }
      writeAuditLog(auth.userId, 'AGENT_TASK_UPDATED', `#${task.id} ${Object.keys(data).join(',')}`, getIp(request))
      emitInvalidate('tasks', { projectId: auth.projectId })
      return { task: enrich(task) }
    })
}
