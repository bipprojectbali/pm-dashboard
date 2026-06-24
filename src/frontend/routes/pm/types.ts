import type { IconType } from 'react-icons'
import type { ProjectDetailTab } from '@/frontend/components/ProjectDetailView'

export const validTabs = ['overview', 'projects', 'tasks', 'team', 'events'] as const
export type TabKey = (typeof validTabs)[number]

export type PmSearch = {
  tab: TabKey
  projectId?: string
  detailTab?: ProjectDetailTab
  taskId?: string
  eventId?: string
  eventMode?: 'create' | 'edit'
}

export type NavItem = {
  label: string
  description: string
  icon: IconType
  key: TabKey
  badge?: string
  badgeColor?: string
}

export type OverviewTask = {
  id: string
  title: string
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  kind: 'TASK' | 'BUG' | 'QC'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dueAt: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  projectId: string
  project: { id: string; name: string } | null
}

export type OverviewNotification = {
  id: string
  kind:
    | 'TASK_ASSIGNED'
    | 'TASK_COMMENTED'
    | 'TASK_STATUS_CHANGED'
    | 'TASK_DUE_SOON'
    | 'TASK_OVERDUE'
    | 'TASK_MENTIONED'
  taskId: string | null
  projectId: string | null
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
  actor: { id: string; name: string; email: string } | null
}
