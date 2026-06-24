import type { ProjectStatus } from './types'

export const THIS_YEAR = new Date().getFullYear()

export function fmtGanttDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const base = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
  return d.getFullYear() !== THIS_YEAR ? `${base} '${String(d.getFullYear()).slice(2)}` : base
}

export const PROJECT_GANTT_COLOR: Record<ProjectStatus, string> = {
  DRAFT: '#6c757d',
  ACTIVE: '#4a7abf',
  ON_HOLD: '#c49a28',
  COMPLETED: '#3a8f6a',
  CANCELLED: '#868e96',
}
export const PROJECT_GANTT_OVERDUE = '#a84444'

export type ProjViewMode = 'day' | 'week' | 'month'

export const PROJ_COL_WIDTH: Record<ProjViewMode, number> = { day: 44, week: 28, month: 18 }
export const PROJ_EFFECTIVE_DAY_PX: Record<ProjViewMode, number> = {
  day: 44,
  week: Math.max(28 / 2, 14),
  month: Math.max(18 / 6, 7),
}

export const PROJ_VIEW_OPTIONS: Array<{ value: ProjViewMode; label: string }> = [
  { value: 'day', label: 'Hari' },
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
]

export const ROW_H = 52
export const HDR_H = 56
