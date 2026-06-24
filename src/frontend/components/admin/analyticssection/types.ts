export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface AnalyticsData {
  timestamp: string
  projectsByStatus: Partial<Record<ProjectStatus, number>>
  tasksByStatus: Partial<Record<TaskStatus, number>>
  timeline: Array<{
    id: string
    name: string
    status: ProjectStatus
    priority: Priority
    owner: string
    startsAt: string | null
    endsAt: string | null
    originalEndAt: string | null
    slipped: boolean
  }>
  deadlineGroups: {
    endingSoon: DeadlineFuture[]
    endingMonth: DeadlineFuture[]
    pastDue: DeadlinePast[]
  }
  taskTrend: Array<{ date: string; created: number; closed: number }>
}

export interface DeadlineFuture {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  owner: string
  endsAt: string | null
  daysUntil: number | null
}

export interface DeadlinePast {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  owner: string
  endsAt: string | null
  daysOverdue: number | null
}

export const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: '#868e96',
  ACTIVE: '#12b886',
  ON_HOLD: '#fd7e14',
  COMPLETED: '#228be6',
  CANCELLED: '#495057',
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#fd7e14',
  READY_FOR_QC: '#9775fa',
  REOPENED: '#fa5252',
  CLOSED: '#12b886',
}
