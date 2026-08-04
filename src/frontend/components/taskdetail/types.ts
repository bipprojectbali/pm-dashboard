export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TaskKind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
export type ProjectMemberRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'

export interface TaskUser {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
  blocked?: boolean
}

export interface TaskComment {
  id: string
  body: string
  authorTag: string
  createdAt: string
  editedAt: string | null
  author: TaskUser
}

export interface TaskEvidence {
  id: string
  kind: string
  url: string
  note: string | null
  createdAt: string
}

export interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

export interface DependencyTask {
  id: string
  title: string
  status: TaskStatus
  kind: TaskKind
}

export interface ChecklistItem {
  id: string
  title: string
  done: boolean
  order: number
}

export interface StatusChange {
  id: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
  createdAt: string
  author: { id: string; name: string; email: string } | null
}

export interface TagListItem {
  id: string
  projectId: string
  name: string
  color: string
}

export interface TaskDetail {
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
  phaseId: string | null
  phase: { id: string; title: string } | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  actualHours: number | null
  progressPercent: number | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  comments: TaskComment[]
  evidence: TaskEvidence[]
  tags: TaskTag[]
  blockedBy: Array<{ id: string; blockedById: string; blockedBy: DependencyTask }>
  blocks: Array<{ id: string; taskId: string; task: DependencyTask }>
  checklist: ChecklistItem[]
  statusChanges: StatusChange[]
}

export interface ProjectDetail {
  id: string
  name: string
  members: Array<{
    userId: string
    role: ProjectMemberRole
    user: TaskUser
  }>
}
