export interface SnapshotKpi {
  totalTasks: number
  openTasks: number
  closedToday: number
  overdueCount: number
  staleCount: number
  velocity7d: number
  totalProjects: number
  activeProjects: number
}

export interface SnapshotProject {
  id: string
  name: string
  status: string
  score: number
  grade: string
  openTasks: number
  overdueTasks: number
  blockedTasks: number
  daysUntilDue: number | null
  pastDue: boolean
}

export interface SnapshotTeamMember {
  userId: string
  name: string
  open: number
  overdue: number
  closed7d: number
  estimateHours: number
  overloaded: boolean
}

export interface SnapshotRisks {
  severity: string
  pastDueProjects: number
  overdueTasks: number
  staleTasks: number
}

export interface DailySnapshotData {
  id: string
  date: Date
  kpi: SnapshotKpi
  projects: SnapshotProject[]
  team: SnapshotTeamMember[]
  risks: SnapshotRisks
  createdAt: Date
}
