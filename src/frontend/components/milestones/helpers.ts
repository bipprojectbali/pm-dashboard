import type { TagListItem } from '../MilestoneEditModal'
import type { ProjectMilestone } from './types'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function groupMilestones(ms: ProjectMilestone[]) {
  const groups = new Map<string, { tag: TagListItem; items: ProjectMilestone[] }>()
  const untagged: ProjectMilestone[] = []
  for (const m of ms) {
    if (!m.tags.length) {
      untagged.push(m)
      continue
    }
    const first = m.tags[0].tag
    if (!groups.has(first.id)) groups.set(first.id, { tag: first, items: [] })
    groups.get(first.id)!.items.push(m)
  }
  return { groups: [...groups.values()], untagged }
}
