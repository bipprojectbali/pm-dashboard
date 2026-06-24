export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TaskKind = 'TASK' | 'BUG' | 'QC'

export interface TriageTask {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: { id: string; name: string; email: string; image?: string | null } | null
  startsAt: string | null
  dueAt: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

export type QuickFilter = 'all' | 'overdue' | 'unassigned' | 'blocked' | 'stale'

export const STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  READY_FOR_QC: 'yellow',
  REOPENED: 'orange',
  CLOSED: 'green',
}

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const KIND_COLOR: Record<TaskKind, string> = {
  TASK: 'blue',
  BUG: 'red',
  QC: 'teal',
}

export const STALE_DAYS = 7
export const PAGE_SIZE = 25

export function isOpen(t: TriageTask) {
  return t.status !== 'CLOSED'
}

export function isOverdue(t: TriageTask) {
  if (!t.dueAt || !isOpen(t)) return false
  return new Date(t.dueAt).getTime() < Date.now()
}

export function isStale(t: TriageTask) {
  if (!isOpen(t)) return false
  return Date.now() - new Date(t.updatedAt).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000
}

export function formatAge(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (d === 0) return 'today'
  if (d === 1) return '1d'
  return `${d}d`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
