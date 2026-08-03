// Helpers for PATCH /api/tasks/:id — request-body validation + data building,
// and the post-update persistence/side-effects (status-change row, tag replace,
// audit log, assignment/status notifications, cache invalidation).
import type { Task } from '../../../generated/prisma'
import { prisma } from '../../lib/db'
import { notifyTaskAssigned, notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getAllowedTaskTransitions, getIp, isStatusValidForKind, writeAuditLog } from '../../lib/route-helpers'
import { isValidKind } from '../../lib/task-enums'

export type TaskUpdateBody = {
  title?: string
  description?: string
  priority?: string
  kind?: string
  route?: string | null
  status?: string
  assigneeId?: string | null
  startsAt?: string | null
  dueAt?: string | null
  estimateHours?: number | null
  progressPercent?: number | null
  tagIds?: string[]
  phaseId?: string | null
}

type StatusEnum = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type Change = { from: string; to: string }

export type BuiltUpdate = {
  data: Record<string, unknown>
  kindChange: Change | null
  statusTransition: Change | null
}

// Validate the body against the current task and build the Prisma `data` patch.
// Returns `{ error }` (caller maps to 400) on any validation failure.
export function buildTaskUpdateData(
  body: TaskUpdateBody,
  current: { status: string; kind: 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA' },
): { error: string } | BuiltUpdate {
  if (body.title !== undefined && body.title.length > 500) {
    return { error: 'Title must be 500 characters or fewer' }
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.priority !== undefined) data.priority = body.priority
  // Track kind changes (e.g. promoting an IDEA into a TASK) so the audit
  // trail records where a piece of work originated.
  let kindChange: Change | null = null
  if (body.kind !== undefined) {
    if (!isValidKind(body.kind)) {
      return { error: `kind must be one of: TASK, BUG, QC, TICKET, IDEA` }
    }
    // Guard against reassigning a task to a kind whose lifecycle can't hold
    // its current status (e.g. a TICKET in READY_FOR_QC turned into a TASK,
    // which has no QC stage). The status the task will end up with is the one
    // in this request if it also transitions, else the current status.
    const effectiveStatus = body.status ?? current.status
    if (!isStatusValidForKind(effectiveStatus, body.kind)) {
      return {
        error: `Status '${effectiveStatus}' tidak valid untuk kind ${body.kind} — ubah status ke yang valid dulu`,
      }
    }
    data.kind = body.kind
    if (body.kind !== current.kind) kindChange = { from: current.kind, to: body.kind }
  }
  if (body.route !== undefined) data.route = body.route
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (body.estimateHours !== undefined)
    data.estimateHours = body.estimateHours === null ? null : Number(body.estimateHours)
  if (body.progressPercent !== undefined) {
    const p = body.progressPercent
    data.progressPercent = p === null ? null : Math.max(0, Math.min(100, Math.round(p)))
  }
  if (body.phaseId !== undefined) data.phaseId = body.phaseId
  let statusTransition: Change | null = null
  if (body.status !== undefined) {
    const allowed = getAllowedTaskTransitions(current.status, current.kind)
    if (!allowed.includes(body.status)) {
      return { error: `Invalid transition: ${current.status} → ${body.status} for ${current.kind}` }
    }
    if (body.status !== current.status) statusTransition = { from: current.status, to: body.status }
    data.status = body.status
    if (body.status === 'CLOSED') data.closedAt = new Date()
    if (body.status === 'REOPENED') data.closedAt = null
  }
  return { data, kindChange, statusTransition }
}

// Persist the status-change row + tag replacement, then fire audit log,
// notifications, and cache invalidation. Mirrors the original handler ordering.
export async function applyTaskUpdateSideEffects(params: {
  task: Task
  current: { status: string; assigneeId: string | null; reporterId: string }
  body: TaskUpdateBody
  auth: { userId: string; role: string }
  request: Request
  built: BuiltUpdate
}): Promise<void> {
  const { task, current, body, auth, request, built } = params
  const { data, kindChange, statusTransition } = built

  if (statusTransition) {
    await prisma.taskStatusChange.create({
      data: {
        taskId: task.id,
        authorId: auth.userId,
        fromStatus: statusTransition.from as StatusEnum,
        toStatus: statusTransition.to as StatusEnum,
      },
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
  const auditDetail = kindChange
    ? `#${task.id} ${Object.keys(data).join(',')} kind:${kindChange.from}→${kindChange.to}`
    : `#${task.id} ${Object.keys(data).join(',')}`
  writeAuditLog(auth.userId, 'TASK_UPDATED', auditDetail, getIp(request))
  const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
  const actorName = actor?.name ?? 'Someone'
  if (
    body.assigneeId !== undefined &&
    body.assigneeId &&
    body.assigneeId !== current.assigneeId &&
    body.assigneeId !== auth.userId
  ) {
    notifyTaskAssigned({
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      assigneeId: body.assigneeId,
      actorId: auth.userId,
      actorName,
      taskKind: task.kind,
    }).catch(() => {})
  }
  if (statusTransition) {
    notifyTaskStatusChanged({
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      reporterId: current.reporterId,
      assigneeId: task.assigneeId,
      actorId: auth.userId,
      actorName,
      fromStatus: statusTransition.from,
      toStatus: statusTransition.to,
    }).catch(() => {})
  }
  emitInvalidate('tasks', { projectId: task.projectId })
}
