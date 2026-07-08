import { applyAssigneeParam } from '../taskspanel/helpers'
import type { KanbanFilters, TaskKind, TaskPriority, TaskStatus } from './types'

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
  TICKET: 'grape',
  IDEA: 'yellow',
}

export const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'OPEN', label: 'Open' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'READY_FOR_QC', label: 'Ready for QC' },
  { status: 'REOPENED', label: 'Reopened' },
  { status: 'CLOSED', label: 'Closed' },
]

export const KANBAN_COL_SIZE = 20

export function kanbanAllowed(current: TaskStatus, kind: TaskKind): TaskStatus[] {
  if (kind === 'TASK') {
    const m: Record<TaskStatus, TaskStatus[]> = {
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
    const m: Record<TaskStatus, TaskStatus[]> = {
      OPEN: ['CLOSED'],
      CLOSED: ['OPEN'],
      IN_PROGRESS: [],
      READY_FOR_QC: [],
      REOPENED: [],
    }
    return m[current] ?? []
  }
  // BUG, QC, and TICKET share the full lifecycle (kanban allows IN_PROGRESS→OPEN).
  const m: Record<TaskStatus, TaskStatus[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['OPEN', 'READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  }
  return m[current] ?? []
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function buildColParams(
  status: TaskStatus,
  offset: number,
  projectId: string | null,
  filters: KanbanFilters,
): string {
  const p = new URLSearchParams({ status, limit: String(KANBAN_COL_SIZE), offset: String(offset) })
  if (projectId) p.set('projectId', projectId)
  if (filters.kind) p.set('kind', filters.kind)
  applyAssigneeParam(p, filters.assigneeFilter ?? null, filters.currentUserId ?? null)
  if (filters.tagId) p.set('tagId', filters.tagId)
  if (filters.phaseId) p.set('phaseId', filters.phaseId)
  if (filters.search) p.set('search', filters.search)
  if (filters.priority) p.set('priority', filters.priority)
  return p.toString()
}
