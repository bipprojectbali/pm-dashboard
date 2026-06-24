import type { TaskDetail, TaskStatus } from '../types'

export interface TaskDetailLeftPanelProps {
  task: TaskDetail
  canWrite: boolean
  isOverdue: boolean
  editingTitle: boolean
  draftTitle: string
  onDraftTitleChange: (v: string) => void
  onSaveTitle: () => void
  onCancelTitle: () => void
  editingDescription: boolean
  draftDescription: string
  onDraftDescriptionChange: (v: string) => void
  onSaveDescription: () => void
  onCancelDescription: () => void
  updatePending: boolean
  onChecklistToggle: (id: string, done: boolean) => void
  onChecklistAdd: (title: string) => void
  onChecklistRemove: (id: string) => void
  checklistAdding: boolean
  onCommentSubmit: (body: string) => void
  commentLoading: boolean
  commentError?: string
  onEvidenceSubmit: (body: { kind: string; url: string; note?: string }) => void
  evidenceLoading: boolean
  evidenceError?: string
  projectTasks: Array<{ id: string; title: string; status: TaskStatus }>
  onDependencyAdd: (blockedById: string) => void
  onDependencyRemove: (blockedById: string) => void
}
