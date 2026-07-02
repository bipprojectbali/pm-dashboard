import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getAllowedTaskTransitions, getIp, writeAuditLog } from '../../lib/route-helpers'
import {
  isValidKind,
  isValidPriority,
  TASK_KIND_VALUES,
  TASK_PRIORITY_VALUES,
  type TaskStatus,
} from '../../lib/task-enums'
import { deny, enrich, LIST_INCLUDE, ownedTask, parseDate, parseJson, parseNumber } from './shared'

// Write routes for the token-scoped agent surface: create + update (+transition).
export function agentTaskWriteRoutes() {
  return new Elysia()
    .post('/api/agent/tasks', async ({ request, set }) => {
      const auth = await resolveAgentAuth(request)
      if (!auth.ok) return deny(set, auth.status, auth.error)
      if (!canWrite(auth)) return deny(set, 403, 'Token is read-only')
      const parsed = await parseJson<{
        title?: string
        description?: string
        kind?: string
        priority?: string
        assigneeEmail?: string
        dueAt?: string
        estimateHours?: number
      }>(request)
      if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
      const body = parsed.body
      if (!body.title?.trim() || !body.description?.trim()) return deny(set, 400, 'title and description are required')
      const kind = body.kind === undefined ? undefined : String(body.kind).toUpperCase()
      const priority = body.priority === undefined ? undefined : String(body.priority).toUpperCase()
      if (kind === 'IDEA') return deny(set, 403, 'IDEA is read-only via access token')
      if (kind !== undefined && !isValidKind(kind))
        return deny(set, 400, `kind must be one of: ${TASK_KIND_VALUES.join(', ')}`)
      if (priority !== undefined && !isValidPriority(priority))
        return deny(set, 400, `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}`)
      const dueAt = parseDate(body.dueAt)
      if (dueAt === 'invalid') return deny(set, 400, 'dueAt must be a valid ISO date')
      const estimateHours = parseNumber(body.estimateHours)
      if (estimateHours === 'invalid') return deny(set, 400, 'estimateHours must be a number')
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
          kind: (kind as 'TASK' | 'BUG' | 'QC' | 'TICKET') ?? 'TASK',
          priority: (priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          reporterId,
          assigneeId,
          dueAt,
          estimateHours,
        },
        include: LIST_INCLUDE,
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
      const parsed = await parseJson<{
        title?: string
        description?: string
        priority?: string
        status?: string
        assigneeEmail?: string | null
        dueAt?: string | null
        estimateHours?: number | null
        progressPercent?: number | null
      }>(request)
      if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
      const body = parsed.body
      const priority = body.priority === undefined ? undefined : String(body.priority).toUpperCase()
      if (priority !== undefined && !isValidPriority(priority))
        return deny(set, 400, `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}`)
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (priority !== undefined) data.priority = priority
      if (body.dueAt !== undefined) {
        const d = parseDate(body.dueAt)
        if (d === 'invalid') return deny(set, 400, 'dueAt must be a valid ISO date')
        data.dueAt = d
      }
      if (body.estimateHours !== undefined) {
        const n = parseNumber(body.estimateHours)
        if (n === 'invalid') return deny(set, 400, 'estimateHours must be a number')
        data.estimateHours = n
      }
      if (body.progressPercent !== undefined) {
        const n = parseNumber(body.progressPercent)
        if (n === 'invalid') return deny(set, 400, 'progressPercent must be a number')
        data.progressPercent = n === null ? null : Math.max(0, Math.min(100, Math.round(n)))
      }
      if (body.assigneeEmail !== undefined) {
        if (body.assigneeEmail === null) data.assigneeId = null
        else {
          const a = await prisma.user.findUnique({ where: { email: body.assigneeEmail }, select: { id: true } })
          if (!a) return deny(set, 400, `Assignee not found: ${body.assigneeEmail}`)
          data.assigneeId = a.id
        }
      }
      let transition: { from: TaskStatus; to: TaskStatus } | null = null
      if (body.status !== undefined && body.status !== current.status) {
        const allowed = getAllowedTaskTransitions(current.status, current.kind)
        if (!allowed.includes(body.status))
          return deny(set, 400, `Invalid transition: ${current.status} → ${body.status}`)
        transition = { from: current.status as TaskStatus, to: body.status as TaskStatus }
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (body.status === 'REOPENED') data.closedAt = null
      }
      const task = await prisma.task.update({ where: { id: params.id }, data, include: LIST_INCLUDE })
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
