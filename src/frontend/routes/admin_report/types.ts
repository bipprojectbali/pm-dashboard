export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface GithubActivityData {
  commits: number
  prsOpened: number
  prsMerged: number
  reviews: number
  byProject: Array<{
    projectId: string
    projectName: string
    repo: string | null
    commits: number
    prsOpened: number
    prsMerged: number
    prsClosed: number
    reviews: number
  }>
}

export interface AuditHighlightData {
  id: string
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
  userEmail: string | null
  userName: string | null
}

export interface ReportFooterData {
  generatedAt: string
  generatedBy: { email: string }
}

export interface ReportPayload {
  window: { since: string; until: string; days: number }
  generatedAt: string
  generatedBy: { email: string }
  kpis: {
    users: { total: number; blocked: number; byRole: Record<string, number> }
    projects: { active: number; byStatus: Record<string, number> }
    tasks: {
      total: number
      byStatus: Record<string, number>
      overdueOpen: number
      staleInProgress: number
      closed7d: number
    }
    velocity: { closed7d: number; extensions7d: number }
  }
  health: {
    count: number
    projects: Array<{
      id: string
      name: string
      status: ProjectStatus
      priority: Priority
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
      grade: Grade
    }>
  }
  risks: {
    severity: 'none' | 'low' | 'medium' | 'high'
    summary: { overdueTasks: number; staleTasks: number; pastDueProjects: number; missingEnv: number }
    overdueTasks: Array<{ id: string; title: string; priority: string; daysOverdue: number | null; project: string }>
    pastDueProjects: Array<{ id: string; name: string; owner: string; daysOverdue: number | null }>
    missingEnv: string[]
  }
  load: {
    count: number
    rows: Array<{
      userId: string | null
      email: string | null
      name: string
      role: string | null
      open: number
      estimateHours: number
      highPriority: number
      overdue: number
      closed7d: number
      overloaded: boolean
    }>
  }
  analytics: {
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
      slipped: boolean
    }>
    taskTrend: Array<{ date: string; created: number; closed: number }>
  }
  priorityGroups: Array<{ priority: Priority; count: number }>
  taskSnapshot: { closedInPeriod: number; createdInPeriod: number; avgHealthScore: number | null }
  github: GithubActivityData
  audit: AuditHighlightData[]
}

export interface UserReportPayload {
  window: { since: string; until: string; days: number }
  generatedAt: string
  generatedBy: { email: string }
  user: { id: string; name: string; email: string; role: string; image: string | null; blocked: boolean }
  total: number
  open: number
  closed: number
  overdue: number
  blocked: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byKind: Record<string, number>
  effort: { actualHours: number; estimateHours: number; over: number; under: number; on: number }
  overdueTasks: Array<{ id: string; title: string; priority: string; status: string; dueAt: string | null }>
  taskTrend: Array<{ date: string; created: number; closed: number }>
  taskSnapshot: { closedInPeriod: number; createdInPeriod: number }
  github: GithubActivityData
  audit: AuditHighlightData[]
}

export interface ReportSearch {
  preset?: string
  userId?: string
}
