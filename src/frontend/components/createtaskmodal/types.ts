export type TaskKind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TagListItem {
  id: string
  projectId: string
  name: string
  color: string
}

export interface ProjectOption {
  id: string
  name: string
  myRole: 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' | null
  canWrite?: boolean
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
