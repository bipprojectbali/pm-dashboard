import { prisma } from './db'

// A ticket "retry" = one READY_FOR_QC → REOPENED bounce. Counting these existing
// TaskStatusChange rows tells Claude how many times a submitted fix was rejected,
// so it can change strategy / escalate instead of looping the same failing ticket.
export const RETRY_ESCALATION_THRESHOLD = 3

const RETRY_WHERE = { fromStatus: 'READY_FOR_QC', toStatus: 'REOPENED' } as const

/** Retry count for a single ticket. */
export async function getRetryCount(taskId: string): Promise<number> {
  return prisma.taskStatusChange.count({ where: { taskId, ...RETRY_WHERE } })
}

/** Retry counts for many tickets in one groupBy (no N+1). Missing ids → 0. */
export async function getRetryCounts(taskIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!taskIds.length) return counts
  const rows = await prisma.taskStatusChange.groupBy({
    by: ['taskId'],
    where: { taskId: { in: taskIds }, ...RETRY_WHERE },
    _count: { _all: true },
  })
  for (const r of rows) counts.set(r.taskId, r._count._all)
  return counts
}
