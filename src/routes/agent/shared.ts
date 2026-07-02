import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { computeActualHours, computeProgressPercent } from '../../lib/route-helpers'

export type Status = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

// Reject helper: writes a JSON error + status and returns a sentinel the caller
// checks. Keeps each handler flat.
export function deny(set: { status?: number | string }, status: number, error: string) {
  set.status = status
  return { error }
}

export const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  checklist: { select: { done: true } },
  _count: { select: { comments: true, evidence: true, blockedBy: true, blocks: true } },
} as const

export function enrich<
  T extends Parameters<typeof computeActualHours>[0] & Parameters<typeof computeProgressPercent>[0],
>(t: T) {
  return { ...t, actualHours: computeActualHours(t), progressPercent: computeProgressPercent(t) }
}

// Load a task and enforce it belongs to the token's project. Returns the task or
// null (caller returns 404 — never leak that a task exists in another project).
export async function ownedTask(taskId: string, projectId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId, deletedAt: null }, include: TASK_INCLUDE })
  if (!task || task.projectId !== projectId) return null
  return task
}

// Checklist items are keyed by itemId (no taskId in URL) — resolve the parent
// task's project and enforce WRITE + ownership in one place.
export async function resolveChecklistWrite(
  request: Request,
  itemId: string,
): Promise<{ projectId: string } | { status: 401 | 403 | 404; error: string }> {
  const auth = await resolveAgentAuth(request)
  if (!auth.ok) return { status: auth.status, error: auth.error }
  if (!canWrite(auth)) return { status: 403, error: 'Token is read-only' }
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { projectId: true } } },
  })
  if (!item || item.task.projectId !== auth.projectId) return { status: 404, error: 'Checklist item not found' }
  return { projectId: auth.projectId }
}
