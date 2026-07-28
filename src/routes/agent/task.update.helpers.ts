// Helpers for PATCH /api/agent/tasks/:id — request validation + data building,
// and the post-update persistence/side-effects (status-change row, tag replace,
// audit log, assignment/status notifications, cache invalidation). Keeps the
// route file within the handler size limit; logic mirrors the session route.
import { resolveReporterId } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { notifyTaskAssigned, notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getAllowedTaskTransitions, getIp, isStatusValidForKind, writeAuditLog } from '../../lib/route-helpers'
import {
  isValidKind,
  isValidPriority,
  TASK_KIND_VALUES,
  TASK_PRIORITY_VALUES,
  type TaskStatus,
} from '../../lib/task-enums'
import { parseDate, parseNumber } from './shared'

export type AgentTaskUpdateBody = {
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
}

type Transition = { from: TaskStatus; to: TaskStatus }

export type BuiltAgentUpdate = {
  data: Record<string, unknown>
  transition: Transition | null
  newAssigneeId: string | null | undefined
}

type CurrentTask = { status: string; kind: 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA' }

// Validate the body and build the Prisma `data` patch. Returns `{ status, error }`
// (caller maps to `deny`) on any validation failure. Async because assignee
// resolution hits the DB.
export async function buildAgentTaskUpdateData(
  body: AgentTaskUpdateBody,
  current: CurrentTask,
): Promise<{ status: number; error: string } | BuiltAgentUpdate> {
  const priority = body.priority === undefined ? undefined : String(body.priority).toUpperCase()
  if (priority !== undefined && !isValidPriority(priority))
    return { status: 400, error: `priority must be one of: ${TASK_PRIORITY_VALUES.join(', ')}` }
  const kind = body.kind === undefined ? undefined : String(body.kind).toUpperCase()
  if (kind !== undefined && !isValidKind(kind))
    return { status: 400, error: `kind must be one of: ${TASK_KIND_VALUES.join(', ')}` }
  if (kind === 'IDEA') return { status: 403, error: 'Cannot change kind to IDEA via access token' }
  // Kind↔status guard (mirrors the session route): reject a kind change when
  // the task's effective status can't be held by the target kind's lifecycle
  // (e.g. READY_FOR_QC → TASK). The effective status is the one in this
  // request if it also transitions, else the current status.
  if (kind !== undefined) {
    const effectiveStatus = body.status ?? current.status
    if (!isStatusValidForKind(effectiveStatus, kind))
      return {
        status: 400,
        error: `Status '${effectiveStatus}' tidak valid untuk kind ${kind} — ubah status ke yang valid dulu`,
      }
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (priority !== undefined) data.priority = priority
  if (kind !== undefined) data.kind = kind
  if (body.route !== undefined) data.route = body.route
  if (body.phaseId !== undefined) data.phaseId = body.phaseId
  if (body.startsAt !== undefined) {
    const d = parseDate(body.startsAt)
    if (d === 'invalid') return { status: 400, error: 'startsAt must be a valid ISO date' }
    data.startsAt = d
  }
  if (body.dueAt !== undefined) {
    const d = parseDate(body.dueAt)
    if (d === 'invalid') return { status: 400, error: 'dueAt must be a valid ISO date' }
    data.dueAt = d
  }
  if (body.estimateHours !== undefined) {
    const n = parseNumber(body.estimateHours)
    if (n === 'invalid') return { status: 400, error: 'estimateHours must be a number' }
    data.estimateHours = n
  }
  if (body.progressPercent !== undefined) {
    const n = parseNumber(body.progressPercent)
    if (n === 'invalid') return { status: 400, error: 'progressPercent must be a number' }
    data.progressPercent = n === null ? null : Math.max(0, Math.min(100, Math.round(n)))
  }
  let newAssigneeId: string | null | undefined
  if (body.assigneeEmail !== undefined) {
    if (body.assigneeEmail === null) {
      data.assigneeId = null
      newAssigneeId = null
    } else {
      const a = await prisma.user.findUnique({ where: { email: body.assigneeEmail }, select: { id: true } })
      if (!a) return { status: 400, error: `Assignee not found: ${body.assigneeEmail}` }
      data.assigneeId = a.id
      newAssigneeId = a.id
    }
  }
  let transition: Transition | null = null
  if (body.status !== undefined && body.status !== current.status) {
    const allowed = getAllowedTaskTransitions(current.status, current.kind)
    if (!allowed.includes(body.status))
      return { status: 400, error: `Invalid transition: ${current.status} → ${body.status}` }
    transition = { from: current.status as TaskStatus, to: body.status as TaskStatus }
    data.status = body.status
    if (body.status === 'CLOSED') data.closedAt = new Date()
    if (body.status === 'REOPENED') data.closedAt = null
  }
  return { data, transition, newAssigneeId }
}

// Persist the status-change row + tag replacement, then fire audit log,
// notifications, and cache invalidation. Mirrors the original handler ordering.
export async function applyAgentTaskUpdateSideEffects(params: {
  task: { id: string; projectId: string; title: string; assigneeId: string | null }
  current: { assigneeId: string | null; reporterId: string }
  body: AgentTaskUpdateBody
  auth: { projectId: string; userId: string | null }
  request: Request
  built: BuiltAgentUpdate
}): Promise<void> {
  const { task, current, body, auth, request, built } = params
  const { data, transition, newAssigneeId } = built

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
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      assigneeId: newAssigneeId,
      actorId,
      actorName,
    }).catch(() => {})
  }
  if (transition) {
    notifyTaskStatusChanged({
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      reporterId: current.reporterId,
      assigneeId: task.assigneeId,
      actorId,
      actorName,
      fromStatus: transition.from,
      toStatus: transition.to,
    }).catch(() => {})
  }
  emitInvalidate('tasks', { projectId: auth.projectId })
}
