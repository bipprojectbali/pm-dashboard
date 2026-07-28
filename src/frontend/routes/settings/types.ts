export type TaskLite = {
  id: string
  title: string
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dueAt: string | null
  closedAt: string | null
  project?: { id: string; name: string }
}

export type ProjectLite = {
  id: string
  name: string
  status: string
  priority: string
  myRole?: string
  _count?: { tasks?: number; members?: number }
}

export type UserPreferences = {
  notifyTaskAssigned: boolean
  notifyTaskStatusChanged: boolean
  notifyMentioned: boolean
  notifyProjectDeadline: boolean
  pmDefaultTab: 'overview' | 'projects' | 'tasks' | 'team'
  tasksDefaultFilter: 'mine' | 'all' | 'priority'
}

export type MySession = {
  id: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export type MyAudit = {
  id: string
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
}

export const roleBadgeColor: Record<string, string> = {
  USER: 'blue',
  QC: 'teal',
  ADMIN: 'violet',
  SUPER_ADMIN: 'red',
}

export const priorityColor: Record<string, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const projectStatusColor: Record<string, string> = {
  PLANNING: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  DONE: 'teal',
  ARCHIVED: 'gray',
  CANCELLED: 'red',
}

export const defaultPrefs: UserPreferences = {
  notifyTaskAssigned: true,
  notifyTaskStatusChanged: true,
  notifyMentioned: true,
  notifyProjectDeadline: true,
  pmDefaultTab: 'overview',
  tasksDefaultFilter: 'mine',
}
