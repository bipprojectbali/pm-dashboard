import type { TagListItem } from '../MilestoneEditModal'

export interface MilestoneTagEntry {
  tagId: string
  tag: TagListItem
}

export interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description: string | null
  dueAt: string | null
  completedAt: string | null
  order: number
  createdAt: string
  updatedAt: string
  tags: MilestoneTagEntry[]
}

export interface MilestoneCardProps {
  m: ProjectMilestone
  canManage: boolean
  now: number
  onToggle: (id: string, done: boolean) => void
  onEdit: (m: ProjectMilestone) => void
  onDelete: (m: ProjectMilestone) => void
  isUpdating: boolean
}
