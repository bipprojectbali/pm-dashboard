import type { TaskListItem } from './types'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

const PRIO: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

export function filterAndSortTasks(
  tasks: TaskListItem[],
  quickFilter: 'overdue' | 'unassigned' | 'openOnly' | 'blocked' | 'nodue' | null,
  dueDateRange: [Date | null, Date | null],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
): TaskListItem[] {
  let filtered = tasks.filter((t) => {
    if (quickFilter === 'openOnly' && t.status === 'CLOSED') return false
    const [dueFrom, dueTo] = dueDateRange
    if (dueFrom || dueTo) {
      if (!t.dueAt) return false
      const due = new Date(t.dueAt).getTime()
      if (dueFrom && due < new Date(dueFrom).getTime()) return false
      if (dueTo) {
        const endOfDay = new Date(dueTo)
        endOfDay.setHours(23, 59, 59, 999)
        if (due > endOfDay.getTime()) return false
      }
    }
    return true
  })
  if (!sortBy) return filtered
  return [...filtered].sort((a, b) => {
    let va: number | string = 0
    let vb: number | string = 0
    if (sortBy === 'priority') { va = PRIO[a.priority]; vb = PRIO[b.priority] }
    else if (sortBy === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase() }
    else if (sortBy === 'dueAt') { va = a.dueAt ? new Date(a.dueAt).getTime() : Infinity; vb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity }
    else if (sortBy === 'createdAt') { va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime() }
    else if (sortBy === 'updatedAt') { va = new Date(a.updatedAt).getTime(); vb = new Date(b.updatedAt).getTime() }
    else if (sortBy === 'estimateHours') { va = a.estimateHours ?? Infinity; vb = b.estimateHours ?? Infinity }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })
}

export function buildTasksQueryString(opts: {
  projectId: string | null; status: string | null; kind: string | null; mine: boolean
  tagFilter: string | null; phaseFilter: string | null; view: string; page: number; pageSize: number
  search: string; priorityFilter: string | null; quickFilter: string | null
}): string {
  const { projectId, status, kind, mine, tagFilter, phaseFilter, view, page, pageSize, search, priorityFilter, quickFilter } = opts
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  if (mine) params.set('mine', '1')
  if (tagFilter) params.set('tagId', tagFilter)
  if (phaseFilter) params.set('phaseId', phaseFilter)
  if (view !== 'kanban') {
    params.set('limit', String(pageSize))
    params.set('offset', String((page - 1) * pageSize))
    if (search.trim()) params.set('search', search.trim())
    if (priorityFilter) params.set('priority', priorityFilter)
    if (quickFilter === 'overdue') params.set('overdueOnly', '1')
    else if (quickFilter === 'unassigned') params.set('unassigned', '1')
    else if (quickFilter === 'nodue') params.set('noDue', '1')
    else if (quickFilter === 'blocked') params.set('blocked', '1')
  }
  return params.toString()
}
