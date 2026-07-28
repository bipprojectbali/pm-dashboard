// Task state-machine rules: which statuses a kind can hold, and the legal
// transitions out of a given status for that kind.

// Statuses a kind can legitimately hold — the set reachable from OPEN through
// that kind's state machine. TASK's lifecycle has no QC stage so it never
// enters READY_FOR_QC; IDEA is OPEN/CLOSED only. Used to guard kind changes: a
// task must not be reassigned to a kind whose lifecycle can't hold its current
// status (e.g. a TICKET sitting in READY_FOR_QC being turned into a TASK).
const VALID_STATUSES_BY_KIND: Record<string, readonly string[]> = {
  TASK: ['OPEN', 'IN_PROGRESS', 'REOPENED', 'CLOSED'],
  BUG: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'],
  QC: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'],
  TICKET: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'],
  IDEA: ['OPEN', 'CLOSED'],
}

export function isStatusValidForKind(status: string, kind: string): boolean {
  return (VALID_STATUSES_BY_KIND[kind] ?? []).includes(status)
}

export function getAllowedTaskTransitions(current: string, kind: 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'): string[] {
  if (kind === 'TASK') {
    const m: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'CLOSED'],
      CLOSED: ['REOPENED'],
      REOPENED: ['IN_PROGRESS', 'CLOSED'],
      READY_FOR_QC: ['CLOSED', 'REOPENED'],
    }
    return m[current] ?? []
  }
  // IDEA only toggles OPEN ↔ CLOSED; promotion to work happens via kind change.
  if (kind === 'IDEA') {
    const m: Record<string, string[]> = { OPEN: ['CLOSED'], CLOSED: ['OPEN'] }
    return m[current] ?? []
  }
  // BUG, QC, and TICKET share the full QC-style lifecycle.
  const m: Record<string, string[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  }
  return m[current] ?? []
}
