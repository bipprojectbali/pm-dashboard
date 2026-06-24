export type MemberRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ProjectVisibility = 'PRIVATE' | 'INTERNAL' | 'PUBLIC'
export type HealthLevel = 'on-track' | 'at-risk' | 'delayed'
export type SortKey = 'updated' | 'created' | 'deadline' | 'priority' | 'progress' | 'name'

export interface ProjectUser {
  id: string
  name: string
  email: string
  image?: string | null
}

export interface TaskStats {
  open: number
  inProgress: number
  readyForQc: number
  reopened: number
  closed: number
  total: number
}

export interface ProjectMember {
  id: string
  userId: string
  role: MemberRole
  joinedAt: string
  user: ProjectUser & { role: string }
}

export interface ProjectListItem {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: ProjectStatus
  priority: ProjectPriority
  visibility: ProjectVisibility
  startsAt: string | null
  endsAt: string | null
  originalEndAt: string | null
  archivedAt: string | null
  githubRepo: string | null
  createdAt: string
  updatedAt: string
  owner: ProjectUser
  members: ProjectMember[]
  _count: { members: number; tasks: number; milestones: number; phases: number }
  myRole: MemberRole | null
  canWrite: boolean
  joinedAt: string | null
  taskStats?: TaskStats
  milestoneStats?: { done: number; total: number }
}

export type ProjectDetail = ProjectListItem

export const _ROLE_COLOR: Record<MemberRole, string> = {
  OWNER: 'red',
  PM: 'violet',
  MEMBER: 'blue',
  VIEWER: 'gray',
}

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

export const STATUS_ACCENT: Record<ProjectStatus, string> = {
  DRAFT: 'rgba(134,142,150,0.35)',
  ACTIVE: 'rgba(34,139,230,0.45)',
  ON_HOLD: 'rgba(250,176,5,0.45)',
  COMPLETED: 'rgba(64,192,87,0.45)',
  CANCELLED: 'rgba(73,80,87,0.35)',
}

export const _OVERDUE_ACCENT = 'rgba(250,82,82,0.55)'

export const STATUS_BG: Record<ProjectStatus, string> = {
  DRAFT: 'rgba(134,142,150,0.05)',
  ACTIVE: 'rgba(34,139,230,0.05)',
  ON_HOLD: 'rgba(250,176,5,0.05)',
  COMPLETED: 'rgba(64,192,87,0.05)',
  CANCELLED: 'rgba(73,80,87,0.04)',
}

export const PRIORITY_COLOR: Record<ProjectPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export const PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'deadline', label: 'Deadline (soonest)' },
  { value: 'priority', label: 'Priority (high→low)' },
  { value: 'progress', label: 'Progress (high→low)' },
  { value: 'name', label: 'Name (A→Z)' },
]

export const _ROLE_FILTER_OPTIONS: Array<{ value: MemberRole; label: string }> = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'PM', label: 'PM' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
]

export const PRIORITY_RANK: Record<ProjectPriority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

export const STATUS_GROUP_ORDER: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'DRAFT', 'COMPLETED', 'CANCELLED']

export const STATUS_GROUP_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Aktif',
  ON_HOLD: 'Ditunda',
  DRAFT: 'Draft',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}
