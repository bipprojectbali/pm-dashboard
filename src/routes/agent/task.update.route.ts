import { Elysia } from 'elysia'
import { canWrite, resolveAgentAuth, resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { notifyTaskAssigned, notifyTaskStatusChanged } from '../../lib/notifications'
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

// PATCH update for the token-scoped agent surface, with field parity vs the
// session API: tagIds, phaseId, startsAt, kind, route plus status notifications.
export function agentTaskUpdateRoutes() {
  return new Elysia().patch('/api/agent/tasks/:id', async ({ request, params, set }) => {
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
      kind?: string
      route?: string | null
      assigneeEmail?: string | null
      startsAt?: string | null
      dueAt?: string | null
      estimateHours?: number | null
      progressPercent?: number | null
      tagIds?: string[]
      phaseId?: string | null
    }>(request)
    if (!parsed.ok) return deny(set, 400, 'Invalid JSON body')
    const body = parsed.body
    const priority = body.priority === undefined ? undefined : String(body.priority).toUpperCase()
    if (priority !== undefined && !isValidPriority(priority))
      return deny(set, 400, `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}`)
    const kind = body.kind === undefined ? undefined : String(body.kind).toUpperCase()
    if (kind !== undefined && !isValidKind(kind))
      return deny(set, 400, `kind must be one of: ${TASK_KIND_VALUES.join(', ')}`)
    if (kind === 'IDEA') return deny(set, 403, 'Cannot change kind to IDEA via access token')
    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title
    if (body.description !== undefined) data.description = body.description
    if (priority !== undefined) data.priority = priority
    if (kind !== undefined) data.kind = kind
    if (body.route !== undefined) data.route = body.route
    if (body.phaseId !== undefined) data.phaseId = body.phaseId
    if (body.startsAt !== undefined) {
      const d = parseDate(body.startsAt)
      if (d === 'invalid') return deny(set, 400, 'startsAt must be a valid ISO date')
      data.startsAt = d
    }
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
    let newAssigneeId: string | null | undefined = undefined
    if (body.assigneeEmail !== undefined) {
      if (body.assigneeEmail === null) {
        data.assigneeId = null
        newAssigneeId = null
      } else {
        const a = await prisma.user.findUnique({ where: { email: body.assigneeEmail }, select: { id: true } })
        if (!a) return deny(set, 400, `Assignee not found: ${body.assigneeEmail}`)
        data.assigneeId = a.id
        newAssigneeId = a.id
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
    const actorId = await resolveReporterId(auth.projectId, auth.userId)
    if (transition) {
      await prisma.taskStatusChange.create({
        data: { taskId: task.id, authorId: actorId, fromStatus: transition.from, toStatus: transition.to },
      })
    }
    if (body.tagIds !== undefined) {
      await prisma.taskTag.deleteMany({ where: { taskId: task.id } })
      if (body.tagIds.length)
        await prisma.taskTag.createMany({
          data: body.tagIds.map((tagId) => ({ taskId: task.id, tagId })),
          skipDuplicates: true,
        })
    }
    writeAuditLog(auth.userId, 'AGENT_TASK_UPDATED', `#${task.id} ${Object.keys(data).join(',')}`, getIp(request))
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
    const actorName = actor?.name ?? 'Agent'
    if (newAssigneeId && newAssigneeId !== current.assigneeId) {
      notifyTaskAssigned({
        taskId: task.id, projectId: task.projectId, taskTitle: task.title,
        assigneeId: newAssigneeId, actorId, actorName,
      }).catch(() => {})
    }
    if (transition) {
      notifyTaskStatusChanged({
        taskId: task.id, projectId: task.projectId, taskTitle: task.title,
        reporterId: current.reporterId, assigneeId: task.assigneeId,
        actorId, actorName, fromStatus: transition.from, toStatus: transition.to,
      }).catch(() => {})
    }
    emitInvalidate('tasks', { projectId: auth.projectId })
    return { task: enrich(task) }
  })
}
