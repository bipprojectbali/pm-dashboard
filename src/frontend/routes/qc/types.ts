export interface Ticket {
  id: string
  title: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  route: string | null
  createdAt: string
  reporter: { id: string; name: string; email: string } | null
  assignee: { id: string; name: string; email: string } | null
  _count: { evidence: number; comments: number }
}

export interface TicketDetail extends Ticket {
  description: string
  tags: { tag: { id: string; name: string; color: string } }[]
  evidence: { id: string; url: string; kind: string; label: string | null; createdAt: string }[]
  comments: {
    id: string
    body: string
    createdAt: string
    author: { id: string; name: string; email: string; role: string } | null
  }[]
  checklist: { id: string; title: string; done: boolean; order: number }[]
  statusChanges: {
    id: string
    fromStatus: string
    toStatus: string
    createdAt: string
    author: { id: string; name: string; email: string } | null
  }[]
}

export interface SelfProject {
  id: string
  name: string
  githubRepo: string | null
}

export interface QcContext {
  selfProject: SelfProject | null
  canWrite: boolean
  stats: Record<string, number> | null
}

export const statusBadge: Record<string, { color: string; label: string }> = {
  OPEN: { color: 'red', label: 'Open' },
  REOPENED: { color: 'orange', label: 'Reopened' },
  IN_PROGRESS: { color: 'blue', label: 'In Progress' },
  READY_FOR_QC: { color: 'violet', label: 'Ready for QC' },
  CLOSED: { color: 'green', label: 'Closed' },
}

export const priorityBadge: Record<string, { color: string; label: string }> = {
  LOW: { color: 'gray', label: 'Low' },
  MEDIUM: { color: 'blue', label: 'Medium' },
  HIGH: { color: 'orange', label: 'High' },
  CRITICAL: { color: 'red', label: 'Critical' },
}
