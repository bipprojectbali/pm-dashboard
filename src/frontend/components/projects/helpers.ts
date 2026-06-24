import { PRIORITY_RANK, type HealthLevel, type ProjectListItem, type SortKey } from './types'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000))
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function computeOverdue(p: ProjectListItem): { overdue: boolean; daysOver: number } {
  if (!p.endsAt) return { overdue: false, daysOver: 0 }
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED') return { overdue: false, daysOver: 0 }
  const end = new Date(p.endsAt)
  const now = new Date()
  if (end.getTime() >= now.getTime()) return { overdue: false, daysOver: 0 }
  return { overdue: true, daysOver: daysBetween(end, now) }
}

export function computeTimeProgress(p: ProjectListItem): number | null {
  if (!p.startsAt || !p.endsAt) return null
  const start = new Date(p.startsAt).getTime()
  const end = new Date(p.endsAt).getTime()
  const now = Date.now()
  if (end <= start) return null
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

export function computeTaskProgress(p: ProjectListItem): number | null {
  if (!p.taskStats || p.taskStats.total === 0) return null
  return Math.round((p.taskStats.closed / p.taskStats.total) * 100)
}

export function computeHealth(p: ProjectListItem): { level: HealthLevel; label: string; color: string } | null {
  if (p.status === 'COMPLETED' || p.status === 'CANCELLED' || p.status === 'DRAFT') return null
  const tp = computeTimeProgress(p)
  const xp = computeTaskProgress(p)
  if (tp === null || xp === null) return null
  const delta = xp - tp
  if (delta >= -10) return { level: 'on-track', label: 'On track', color: 'green' }
  if (delta >= -25) return { level: 'at-risk', label: 'At risk', color: 'yellow' }
  return { level: 'delayed', label: 'Delayed', color: 'red' }
}

export function sortProjects(list: ProjectListItem[], key: SortKey): ProjectListItem[] {
  const out = [...list]
  switch (key) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name))
    case 'deadline':
      return out.sort((a, b) => {
        const ae = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY
        const be = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY
        return ae - be
      })
    case 'progress':
      return out.sort((a, b) => (computeTaskProgress(b) ?? -1) - (computeTaskProgress(a) ?? -1))
    case 'priority':
      return out.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
    case 'created':
      return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    default:
      return out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }
}
