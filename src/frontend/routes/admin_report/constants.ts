import type { Grade, Priority, ProjectStatus, TaskStatus } from './types'

export const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const PRIORITY_HEX: Record<Priority, string> = {
  LOW: '#868e96',
  MEDIUM: '#228be6',
  HIGH: '#fd7e14',
  CRITICAL: '#fa5252',
}

export const GRADE_COLOR: Record<Grade, string> = {
  A: 'teal',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  E: 'red',
  F: 'red',
}

export const PROJECT_STATUS_HEX: Record<ProjectStatus, string> = {
  DRAFT: '#868e96',
  ACTIVE: '#12b886',
  ON_HOLD: '#fd7e14',
  COMPLETED: '#228be6',
  CANCELLED: '#495057',
}

export const TASK_STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#fd7e14',
  READY_FOR_QC: '#9775fa',
  REOPENED: '#fa5252',
  CLOSED: '#12b886',
}

export const SEVERITY_COLOR: Record<string, string> = {
  none: 'teal',
  low: 'blue',
  medium: 'orange',
  high: 'red',
}

export const PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Bulan ini', value: 'month' },
  { label: '30 hari', value: '30d' },
  { label: '90 hari', value: '90d' },
  { label: 'Tahun ini', value: 'ytd' },
]

export function resolveRange(preset: string): { since: Date; until: Date } {
  const now = new Date()
  const until = now
  if (preset === '30d') return { since: new Date(now.getTime() - 30 * 86_400_000), until }
  if (preset === '90d') return { since: new Date(now.getTime() - 90 * 86_400_000), until }
  if (preset === 'ytd') return { since: new Date(now.getFullYear(), 0, 1), until }
  return { since: new Date(now.getFullYear(), now.getMonth(), 1), until }
}

export function fmtDate(d: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtRange(since: string, until: string): string {
  return `${fmtDate(since)} — ${fmtDate(until)}`
}
