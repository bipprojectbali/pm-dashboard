import type { Role } from '@/frontend/hooks/useAuth'

export interface AdminUser {
  id: string
  role: Role
  blocked: boolean
}

export interface ProjectRow {
  id: string
  status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
}

export interface TaskRow {
  id: string
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  dueAt: string | null
}

export interface AuditLogEntry {
  id: string
  userId: string | null
  action: string
  detail: string | null
  createdAt: string
  user: { name: string; email: string; image?: string | null } | null
}

export type RiskSeverity = 'none' | 'low' | 'medium' | 'high'

export interface RiskReport {
  severity: RiskSeverity
  summary: {
    overdueTasks: number
    staleTasks: number
    pastDueProjects: number
    missingEnv: number
  }
  overdueTasks: Array<{
    id: string
    title: string
    priority: string
    daysOverdue: number | null
    assignee: string | null
    project: string
    projectId: string
  }>
  staleTasks: Array<{
    id: string
    title: string
    priority: string
    daysStale: number
    assignee: string | null
    project: string
    projectId: string
  }>
  pastDueProjects: Array<{ id: string; name: string; priority: string; owner: string; daysOverdue: number | null }>
  missingEnv: string[]
}

export interface HealthRow {
  id: string
  name: string
  status: string
  priority: string
  owner: string
  endsAt: string | null
  daysUntilDue: number | null
  pastDue: boolean
  openTasks: number
  overdueTasks: number
  blockedTasks: number
  closed7d: number
  extensions: number
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
}

export interface LoadRow {
  userId: string | null
  email: string | null
  name: string
  role: string | null
  image?: string | null
  open: number
  estimateHours: number
  highPriority: number
  overdue: number
  closed7d: number
  overloaded: boolean
}

export interface UpcomingEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  tags: Array<{ tagId: string; tag: { name: string; color: string } }>
  project: { id: string; name: string } | null
}
