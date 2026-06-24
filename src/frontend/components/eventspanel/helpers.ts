import type { TeamEvent } from './types'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function countdown(startsAt: string): { label: string; color: string } {
  const diffMs = new Date(startsAt).getTime() - Date.now()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs < 0) return { label: 'Selesai', color: 'gray' }
  if (diffDays === 0) return { label: 'Hari ini', color: 'red' }
  if (diffDays === 1) return { label: 'Besok', color: 'orange' }
  if (diffDays <= 7) return { label: `${diffDays} hari lagi`, color: 'yellow' }
  return { label: `${diffDays} hari lagi`, color: 'blue' }
}

export function formatDateRange(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt)
  const dateStr = start.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  if (!endsAt) return `${dateStr}, ${timeStr}`
  const endTime = new Date(endsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr}, ${timeStr} – ${endTime}`
}

export function groupByDay(events: TeamEvent[]) {
  const map = new Map<string, TeamEvent[]>()
  for (const e of events) {
    const key = e.startsAt.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).map(([key, items]) => {
    const d = new Date(`${key}T00:00:00`)
    return {
      groupKey: key,
      groupLabel: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      items,
      tagColor: undefined as string | undefined,
    }
  })
}

// Setiap event masuk tepat satu kali (group tag pertama) — mencegah duplikat di event multi-tag.
export function groupByTag(events: TeamEvent[]) {
  const tagMap = new Map<string, { name: string; color: string; items: TeamEvent[] }>()
  const noTag: TeamEvent[] = []
  for (const e of events) {
    if (e.tags.length === 0) {
      noTag.push(e)
    } else {
      const first = e.tags[0].tag
      if (!tagMap.has(first.id)) tagMap.set(first.id, { name: first.name, color: first.color, items: [] })
      tagMap.get(first.id)!.items.push(e)
    }
  }
  const groups = Array.from(tagMap.entries())
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, { name, color, items }]) => ({ groupKey: id, groupLabel: name, tagColor: color, items }))
  if (noTag.length) groups.push({ groupKey: '__no_tag__', groupLabel: 'Tanpa Tag', tagColor: 'gray', items: noTag })
  return groups
}
