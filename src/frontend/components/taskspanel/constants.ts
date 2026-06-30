import type { CSSProperties } from 'react'
import type { TaskKind, TaskPriority, TaskStatus } from './types'

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

export const STICKY_COL_HEADER: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  background: 'var(--mantine-color-body)',
  minWidth: 280,
  width: 280,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}

export const STICKY_COL_CELL: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
  minWidth: 280,
  width: 280,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}
