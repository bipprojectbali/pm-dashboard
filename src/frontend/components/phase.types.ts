export type PhaseStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED'

export interface ProjectPhase {
  id: string
  projectId: string
  title: string
  description: string | null
  summary: string | null
  status: PhaseStatus
  order: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  _count: { tasks: number }
  tags: Array<{ tagId: string; tag: { id: string; name: string; color: string } }>
}

export interface TagOption {
  id: string
  name: string
  color: string
}

export const PHASE_STATUS_COLOR: Record<PhaseStatus, string> = {
  PLANNING: 'gray',
  ACTIVE: 'blue',
  COMPLETED: 'green',
}

export const STATUS_OPTIONS = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
]

export function formatPhaseDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
