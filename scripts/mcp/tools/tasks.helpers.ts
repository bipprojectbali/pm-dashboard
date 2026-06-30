import { prisma } from '../../../src/lib/db'

export type TaskKind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

export async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export async function resolveUserEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true } })
}

export const TRANSITIONS: Record<TaskKind, Record<TaskStatus, TaskStatus[]>> = {
  TASK: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['OPEN', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  BUG: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  QC: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  // TICKET = intake request, follows the same full lifecycle as BUG.
  TICKET: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  // IDEA = backlog capture. Only OPEN (aktif) ↔ CLOSED (ditolak/diarsipkan).
  // "Naik kelas jadi pekerjaan" is done by changing kind IDEA→TASK, not by a
  // status transition — so the middle workflow states are intentionally empty.
  IDEA: {
    OPEN: ['CLOSED'],
    IN_PROGRESS: [],
    READY_FOR_QC: [],
    REOPENED: [],
    CLOSED: ['OPEN'],
  },
}

export function shortestPath(kind: TaskKind, from: TaskStatus, to: TaskStatus): TaskStatus[] | null {
  if (from === to) return []
  const graph = TRANSITIONS[kind]
  const queue: Array<{ node: TaskStatus; path: TaskStatus[] }> = [{ node: from, path: [] }]
  const seen = new Set<TaskStatus>([from])
  while (queue.length) {
    const { node, path } = queue.shift() as { node: TaskStatus; path: TaskStatus[] }
    for (const next of graph[node]) {
      if (seen.has(next)) continue
      const np = [...path, next]
      if (next === to) return np
      seen.add(next)
      queue.push({ node: next, path: np })
    }
  }
  return null
}

export async function validateTagsForProject(projectId: string, tagIds: string[]) {
  if (!tagIds.length) return { ok: true as const }
  const found = await prisma.tag.findMany({
    where: { id: { in: tagIds }, projectId },
    select: { id: true },
  })
  if (found.length !== tagIds.length) {
    return { ok: false as const, error: 'One or more tagIds do not belong to this project' }
  }
  return { ok: true as const }
}
