// Helpers for POST /api/tasks/reorder — Kanban drag-and-drop. A drop can
// carry a `kanbanOrder` change only (pure reorder within a column) or also a
// `status` change (dragged to a different column). Only the latter needs the
// closedAt/TaskStatusChange/notification side effects that every other
// status-changing surface (PATCH /api/tasks/:id, agent REST, MCP tools)
// already applies — a pure reorder must never touch them.
import type { Task } from '../../../generated/prisma'
import { prisma } from '../../lib/db'
import { notifyTaskStatusChanged } from '../../lib/notifications'
import { getAllowedTaskTransitions } from '../../lib/route-helpers'

type StatusEnum = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

export type ReorderUpdate = { id: string; kanbanOrder: number; status?: string }

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

// A row in the batch that actually moves the task between columns, paired with
// its pre-update row (the `fromStatus` + notification recipients).
type ReorderTransition = { before: Task; toStatus: StatusEnum }

// Gate every status-carrying row through the SAME state machine the sidebar
// uses (getAllowedTaskTransitions in src/lib/task-lifecycle.ts, via
// PATCH /api/tasks/:id). Without this the endpoint wrote whatever status the
// client sent, so dropping a card in the wrong column could skip a kind's QC
// gate outright.
//
// All-or-nothing on purpose: a drag is one user gesture over a whole column, so
// applying the legal rows and dropping the illegal one would leave exactly the
// half-moved board that the surrounding transaction exists to prevent — and the
// kanbanOrder sequence the frontend computed assumes every row lands.
//
// A row whose `status` equals the current one is a no-op, not a transition: the
// state machine lists no X → X edge, but a client re-sending the current status
// is not asking for an illegal move.
export function validateReorderTransitions(
  statusUpdates: ReorderUpdate[],
  beforeById: Map<string, Task>,
): { error: string } | { transitions: ReorderTransition[] } {
  const transitions: ReorderTransition[] = []
  for (const u of statusUpdates) {
    const before = beforeById.get(u.id)
    if (!before) return { error: `Task ${u.id} tidak ditemukan` }
    if (!u.status || u.status === before.status) continue
    if (!getAllowedTaskTransitions(before.status, before.kind).includes(u.status)) {
      return {
        error:
          `Transisi status ditolak untuk task "${before.title}" (${before.id}): ` +
          `${before.status} → ${u.status} tidak diizinkan untuk kind ${before.kind}. ` +
          'Seluruh batch reorder dibatalkan.',
      }
    }
    transitions.push({ before, toStatus: u.status as StatusEnum })
  }
  return { transitions }
}

// Validate, then apply the whole batch atomically, then notify.
//
// The task rows and their TaskStatusChange history rows go in ONE transaction:
// a Promise.all of independent updates is not a transaction, so a reject
// partway through used to leave the board half-reordered — colliding/gapped
// kanbanOrder values and some cards moved while their siblings were not, all
// behind a failed response.
//
// Notifications stay OUTSIDE the transaction, deliberately, in both directions:
// firing them inside would announce a status change that a later rollback
// un-does, and notifyTaskStatusChanged does network I/O (Telegram), which must
// never hold a DB transaction open.
export async function applyReorderBatch(params: {
  updates: ReorderUpdate[]
  actorId: string
}): Promise<{ error: string } | { ok: true }> {
  const { updates, actorId } = params
  // Only rows carrying a `status` need the pre-update row (fromStatus +
  // notification recipients) — a pure kanbanOrder reorder skips this entirely.
  const statusUpdates = updates.filter((u) => u.status)
  const beforeById = new Map(
    statusUpdates.length
      ? (await prisma.task.findMany({ where: { id: { in: statusUpdates.map((u) => u.id) } } })).map((t) => [t.id, t])
      : [],
  )

  const validated = validateReorderTransitions(statusUpdates, beforeById)
  if ('error' in validated) return validated

  await prisma.$transaction([
    ...updates.map((u) => prisma.task.update({ where: { id: u.id }, data: buildReorderUpdateData(u) })),
    ...validated.transitions.map((t) =>
      prisma.taskStatusChange.create({
        data: { taskId: t.before.id, authorId: actorId, fromStatus: t.before.status, toStatus: t.toStatus },
      }),
    ),
  ])

  if (validated.transitions.length) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
    const actorName = actor?.name ?? 'Someone'
    // Awaited so the notification rows exist by the time the response lands,
    // but each failure is swallowed: a dead Telegram must not fail the drag.
    await Promise.all(
      validated.transitions.map((t) =>
        notifyTaskStatusChanged({
          taskId: t.before.id,
          projectId: t.before.projectId,
          taskTitle: t.before.title,
          reporterId: t.before.reporterId,
          assigneeId: t.before.assigneeId,
          actorId,
          actorName,
          fromStatus: t.before.status,
          toStatus: t.toStatus,
        }).catch(() => {}),
      ),
    )
  }

  return { ok: true }
}
