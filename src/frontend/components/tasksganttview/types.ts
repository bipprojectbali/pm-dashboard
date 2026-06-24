export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TaskKind = 'TASK' | 'BUG' | 'QC'

export interface TaskUser {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
}
export interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

export interface TaskListItem {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  route: string | null
  reporter: TaskUser
  assignee: TaskUser | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  actualHours: number | null
  progressPercent: number | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  tags: TaskTag[]
  blockedBy: { blockedById: string }[]
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Distinct muted colors per status — identifiable at a glance in dark mode
export const STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: '#4a7abf',
  IN_PROGRESS: '#7b5ea7',
  READY_FOR_QC: '#c49a28',
  REOPENED: '#b86d2a',
  CLOSED: '#3a8f6a',
}
export const OVERDUE_COLOR = '#a84444'

export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 30,
  READY_FOR_QC: 80,
  REOPENED: 20,
  CLOSED: 100,
}

export type ViewMode = 'day' | 'week' | 'month'

// Column width per view mode — passed to mantine-gantt as base unit.
// mantine-gantt divides internally: week (/2), month (/6).
export const COL_WIDTH: Record<ViewMode, number> = { day: 44, week: 120, month: 120 }

// Effective per-day pixel width for scrollToToday offset calculation.
export const EFFECTIVE_DAY_PX: Record<ViewMode, number> = {
  day: 44,
  week: Math.max(120 / 2, 14),
  month: Math.max(120 / 6, 7),
}

export const TASK_LIST_WIDTH = 300
export const ROW_HEIGHT = 52
export const HEADER_HEIGHT = 50
export const SAVE_DELAY_MS = 800

export const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'day', label: 'Hari' },
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
]
