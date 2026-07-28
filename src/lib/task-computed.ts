// Derived (non-stored) task fields: actual hours worked and progress percent.

export function computeActualHours(task: {
  startsAt: Date | null
  createdAt: Date
  closedAt: Date | null
}): number | null {
  if (!task.closedAt) return null
  const start = (task.startsAt ?? task.createdAt).getTime()
  const end = task.closedAt.getTime()
  if (end <= start) return 0
  return Math.round(((end - start) / 3_600_000) * 100) / 100
}

export function computeProgressPercent(task: {
  progressPercent: number | null
  status: string
  checklist?: { done: boolean }[]
}): number | null {
  if (task.status === 'CLOSED') return 100
  if (task.checklist && task.checklist.length > 0) {
    const done = task.checklist.filter((c) => c.done).length
    return Math.round((done / task.checklist.length) * 100)
  }
  return task.progressPercent
}
