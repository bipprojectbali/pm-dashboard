// Helpers for POST /api/tasks/reorder — Kanban drag-and-drop. A drop can
// carry a `kanbanOrder` change only (pure reorder within a column) or also a
// `status` change (dragged to a different column). Only the latter needs the
// closedAt/TaskStatusChange/notification side effects that every other
// status-changing surface (PATCH /api/tasks/:id, agent REST, MCP tools)
// already applies — a pure reorder must never touch them.
import type { Task } from '../../../generated/prisma'
import { prisma } from '../../lib/db'
import { notifyTaskStatusChanged } from '../../lib/notifications'

type StatusEnum = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

// Builds the Prisma `data` patch for one reorder update. Mirrors
// task.update.helpers.ts's closedAt logic (set on CLOSED, clear on
// REOPENED) so a task closed via drag shows up in the same
// throughput/effort aggregates as one closed via the sidebar.
export function buildReorderUpdateData(u: { kanbanOrder: number; status?: string }): Record<string, unknown> {
  const data: Record<string, unknown> = { kanbanOrder: u.kanbanOrder }
  if (u.status) {
    data.status = u.status as StatusEnum
    if (u.status === 'CLOSED') data.closedAt = new Date()
    if (u.status === 'REOPENED') data.closedAt = null
  }
  return data
}

// Writes the TaskStatusChange row + fires notifyTaskStatusChanged for one
// dragged task, using the pre-update row as `fromStatus`. No-op if `status`
// wasn't part of this update (pure reorder).
export async function applyReorderStatusSideEffects(params: {
  update: { id: string; status?: string }
  before: Task
  actorId: string
  actorName: string
}): Promise<void> {
  const { update, before, actorId, actorName } = params
  if (!update.status || update.status === before.status) return

  await prisma.taskStatusChange.create({
    data: {
      taskId: before.id,
      authorId: actorId,
      fromStatus: before.status,
      toStatus: update.status as StatusEnum,
    },
  })

  notifyTaskStatusChanged({
    taskId: before.id,
    projectId: before.projectId,
    taskTitle: before.title,
    reporterId: before.reporterId,
    assigneeId: before.assigneeId,
    actorId,
    actorName,
    fromStatus: before.status,
    toStatus: update.status,
  }).catch(() => {})
}
