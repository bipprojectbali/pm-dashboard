export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Terjemahkan nilai filter assignee gabungan ke query param backend.
// `null` = Semua, `'me'` → mine=1, `'unassigned'` → unassigned=1, `<userId>` → assigneeId=<id>.
export function applyAssigneeParam(
  params: URLSearchParams,
  assigneeFilter: string | null,
  currentUserId: string | null,
): void {
  if (!assigneeFilter) return
  if (assigneeFilter === 'me') {
    if (currentUserId) params.set('assigneeId', currentUserId)
    else params.set('mine', '1')
  } else if (assigneeFilter === 'unassigned') {
    params.set('unassigned', '1')
  } else {
    params.set('assigneeId', assigneeFilter)
  }
}

export function buildTasksQueryString(opts: {
  projectId: string | null
  status: string | null
  kind: string | null
  assigneeFilter: string | null
  currentUserId: string | null
  tagFilter: string | null
  phaseFilter: string | null
  view: string
  page: number
  pageSize: number
  search: string
  priorityFilter: string | null
  quickFilter: string | null
  sortBy?: string | null
  sortDir?: 'asc' | 'desc'
  dueDateRange?: [Date | null, Date | null]
}): string {
  const {
    projectId,
    status,
    kind,
    assigneeFilter,
    currentUserId,
    tagFilter,
    phaseFilter,
    view,
    page,
    pageSize,
    search,
    priorityFilter,
    quickFilter,
    sortBy,
    sortDir,
    dueDateRange,
  } = opts
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  applyAssigneeParam(params, assigneeFilter, currentUserId)
  if (tagFilter) params.set('tagId', tagFilter)
  if (phaseFilter) params.set('phaseId', phaseFilter)
  if (view !== 'kanban') {
    params.set('limit', String(pageSize))
    params.set('offset', String((page - 1) * pageSize))
    if (search.trim()) params.set('search', search.trim())
    if (priorityFilter) params.set('priority', priorityFilter)
    // Quick filters + due-date range are all issued server-side so results stay
    // correct across paginated pages (not just the current page's rows).
    if (quickFilter === 'overdue') params.set('overdueOnly', '1')
    else if (quickFilter === 'openOnly') params.set('openOnly', '1')
    else if (quickFilter === 'nodue') params.set('noDue', '1')
    else if (quickFilter === 'blocked') params.set('blocked', '1')
    const [dueFrom, dueTo] = dueDateRange ?? [null, null]
    if (dueFrom) params.set('dueFrom', dueFrom.toISOString())
    if (dueTo) params.set('dueTo', dueTo.toISOString())
    if (sortBy) {
      params.set('sort', sortBy)
      params.set('dir', sortDir ?? 'asc')
    }
  }
  return params.toString()
}
