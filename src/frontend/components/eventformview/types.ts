export type EventProject = { id: string; name: string }
export type EventTag = { id: string; name: string; color: string }
export type EventTagItem = { tagId: string; tag: EventTag }

export interface TeamEvent {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  location: string | null
  projectId: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  project: EventProject | null
  tags: EventTagItem[]
}

export type FormValues = {
  title: string
  description: string
  startsAt: Date | null
  endsAt: Date | null
  location: string
  projectId: string | null
  tagIds: string[]
}

export const EMPTY: FormValues = {
  title: '',
  description: '',
  startsAt: null,
  endsAt: null,
  location: '',
  projectId: null,
  tagIds: [],
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
