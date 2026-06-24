import type { CSSProperties } from 'react'
import type { ProjectListItem, ProjectPriority, ProjectStatus } from '../../ProjectsPanel'

export const PAGE_SIZE = 25

export const STICKY_PROJECT_HEADER: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  background: 'var(--mantine-color-body)',
  minWidth: 220,
  width: 220,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}

export const STICKY_PROJECT_CELL: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
  minWidth: 220,
  width: 220,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

export const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export type ViewMode = 'table' | 'board' | 'gantt'

export function isOverdue(p: Pick<ProjectListItem, 'endsAt' | 'status'>): boolean {
  if (!p.endsAt) return false
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return false
  return new Date(p.endsAt).getTime() < Date.now()
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
