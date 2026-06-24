export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

export interface AnalyticsTask {
  id: string
  title: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  closedAt: string | null
  startsAt: string | null
  dueAt: string | null
  assignee: { id: string; name: string } | null
  project: { id: string; name: string }
}

export interface AnalyticsProject {
  id: string
  status: ProjectStatus
  name: string
}

export interface OverviewAnalytics {
  projectsByStatus: Record<string, number>
  tasksByStatus: Record<string, number>
  taskTrend: Array<{ date: string; created: number; closed: number }>
  timeline: Array<{
    id: string
    name: string
    status: ProjectStatus
    startsAt: string | null
    endsAt: string | null
    originalEndAt: string | null
    slipped: boolean
  }>
  deadlineGroups: {
    endingSoon: Array<{ id: string; name: string; daysUntil: number | null }>
    endingMonth: Array<{ id: string; name: string; daysUntil: number | null }>
    pastDue: Array<{ id: string; name: string; daysOverdue: number | null }>
  }
}

export interface TimelineRow {
  id: string
  name: string
  status: ProjectStatus
  startsAt: string | null
  endsAt: string | null
  originalEndAt: string | null
  slipped: boolean
  start: Date
  end: Date
}
