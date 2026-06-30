export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TaskKind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'

export interface TaskUser {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
}

export interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

export interface TaskListItem {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  route: string | null
  reporter: TaskUser
  assignee: TaskUser | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  actualHours: number | null
  progressPercent: number | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  phase: { id: string; title: string } | null
  tags: TaskTag[]
  blockedBy: { blockedById: string }[]
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

export interface KanbanFilters {
  kind?: string | null
  mine?: boolean
  tagId?: string | null
  phaseId?: string | null
  search?: string
  priority?: string | null
}
