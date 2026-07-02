import { canWrite, resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { computeActualHours, computeProgressPercent } from '../../lib/route-helpers'

// Reject helper: writes a JSON error + status and returns a sentinel the caller
// checks. Keeps each handler flat.
export function deny(set: { status?: number | string }, status: number, error: string) {
  set.status = status
  return { error }
}

// Parse a JSON body without letting a malformed payload bubble to the app-level
// onError (which would return 500). Callers map { ok: false } → 400.
export async function parseJson<T>(request: Request): Promise<{ ok: true; body: T } | { ok: false }> {
  try {
    return { ok: true, body: (await request.json()) as T }
  } catch {
    return { ok: false }
  }
}

// Lean include for list responses — counts only, no comment/evidence bodies.
export const LIST_INCLUDE = {
  project: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  checklist: { select: { done: true } },
  _count: { select: { comments: true, evidence: true, blockedBy: true, blocks: true } },
} as const

// Rich include for the single-task detail route — full comment/evidence/history
// bodies plus checklist item ids (so an agent can PATCH/DELETE them). enrich()
// still gets checklist{done} + the scalar columns it needs from the base row.
export const DETAIL_INCLUDE = {
  project: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  checklist: { orderBy: { order: 'asc' as const }, select: { id: true, title: true, done: true, order: true } },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      authorTag: true,
      body: true,
      createdAt: true,
      editedAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  },
  evidence: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, kind: true, url: true, note: true, createdAt: true },
  },
  statusChanges: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      fromStatus: true,
      toStatus: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  },
  _count: { select: { comments: true, evidence: true, blockedBy: true, blocks: true } },
} as const

export function enrich<
  T extends Parameters<typeof computeActualHours>[0] & Parameters<typeof computeProgressPercent>[0],
>(t: T) {
  return { ...t, actualHours: computeActualHours(t), progressPercent: computeProgressPercent(t) }
}

// Load a task and enforce it belongs to the token's project. Returns the task or
// null (caller returns 404 — never leak that a task exists in another project).
// `detail` picks the rich include; list/mutation callers use the lean one.
export async function ownedTask(taskId: string, projectId: string, detail = false) {
  const task = await prisma.task.findUnique({
    where: { id: taskId, deletedAt: null },
    include: detail ? DETAIL_INCLUDE : LIST_INCLUDE,
  })
  if (!task || task.projectId !== projectId) return null
  return task
}

// Checklist items are keyed by itemId (no taskId in URL) — resolve the parent
// task's project and enforce WRITE + ownership in one place.
export async function resolveChecklistWrite(
  request: Request,
  itemId: string,
): Promise<{ projectId: string; userId: string | null } | { status: 401 | 403 | 404; error: string }> {
  const auth = await resolveAgentAuth(request)
  if (!auth.ok) return { status: auth.status, error: auth.error }
  if (!canWrite(auth)) return { status: 403, error: 'Token is read-only' }
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { projectId: true } } },
  })
  if (!item || item.task.projectId !== auth.projectId) return { status: 404, error: 'Checklist item not found' }
  return { projectId: auth.projectId, userId: auth.userId }
}
