import { useLocalStorage } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useSession } from '../../hooks/useAuth'
import { notifyError, notifySuccess } from '../../lib/notify'
import { api, computeHealth, computeOverdue, sortProjects } from './helpers'
import type { MemberRole, ProjectListItem, ProjectPriority, ProjectStatus, SortKey } from './types'

export function useProjectsPanelState() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const session = useSession()
  const role = session.data?.user?.role
  const canCreateProject = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const [createOpen, setCreateOpen] = useState(false)
  const [scope, setScope] = useLocalStorage<'mine' | 'all'>({ key: 'pm:projects:scope', defaultValue: 'all' })
  const [statusFilter, setStatusFilter] = useLocalStorage<ProjectStatus | null>({
    key: 'pm:projects:statusFilter',
    defaultValue: null,
  })
  const [priorityFilter, setPriorityFilter] = useLocalStorage<ProjectPriority | null>({
    key: 'pm:projects:priorityFilter',
    defaultValue: null,
  })
  const [roleFilter, setRoleFilter] = useLocalStorage<MemberRole | null>({
    key: 'pm:projects:roleFilter',
    defaultValue: null,
  })
  const [ownerFilter, setOwnerFilter] = useLocalStorage<string | null>({
    key: 'pm:projects:ownerFilter',
    defaultValue: null,
  })
  const [userFilter, setUserFilter] = useLocalStorage<string | null>({
    key: 'pm:projects:userFilter',
    defaultValue: null,
  })
  const [userFilterMode, setUserFilterMode] = useLocalStorage<'avatar' | 'dropdown'>({
    key: 'pm:projects:userFilterMode',
    defaultValue: 'avatar',
  })
  const [derivedFilter, setDerivedFilter] = useState<'overdue' | 'atRisk' | 'delayed' | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useLocalStorage<SortKey>({ key: 'pm:projects:sort', defaultValue: 'updated' })
  const [view, setView] = useLocalStorage<'grid' | 'list' | 'timeline'>({
    key: 'pm:projects:view',
    defaultValue: 'grid',
  })
  const [groupByStatus, setGroupByStatus] = useLocalStorage<boolean>({
    key: 'pm:projects:group-by-status',
    defaultValue: true,
  })
  const [density, setDensity] = useLocalStorage<'comfortable' | 'compact'>({
    key: 'pm:projects:density',
    defaultValue: 'comfortable',
  })

  const openProject = (id: string, detailTab: 'overview' | 'settings' = 'overview') => {
    navigate({
      to: '/pm',
      search:
        detailTab === 'overview' ? { tab: 'projects', projectId: id } : { tab: 'projects', projectId: id, detailTab },
    })
  }

  const projectsQ = useQuery({
    queryKey: ['projects', scope],
    queryFn: () => api<{ projects: ProjectListItem[]; total?: number }>(`/api/projects?scope=${scope}`),
  })

  const create = useMutation({
    mutationFn: (body: {
      name: string
      description?: string
      status?: ProjectStatus
      priority?: ProjectPriority
      startsAt?: string | null
      endsAt?: string | null
    }) =>
      api<{ project: ProjectListItem }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setCreateOpen(false)
      notifySuccess({ message: `Project "${res.project.name}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const projects = projectsQ.data?.projects ?? []
  // When the server caps the list, `total` exceeds the rows we actually got.
  // The panel surfaces a banner so the portfolio stats aren't read as complete.
  const totalProjects = projectsQ.data?.total ?? projects.length
  const isTruncated = totalProjects > projects.length

  const statusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = { DRAFT: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 }
    for (const p of projects) counts[p.status]++
    return counts
  }, [projects])

  const overdueCount = useMemo(() => projects.filter((p) => computeOverdue(p).overdue).length, [projects])
  // "At risk" and "Delayed" are distinct health levels (yellow vs red badge on
  // the card). Keep them as separate portfolio buckets so the yellow "At risk"
  // stat does not silently absorb red "Delayed" projects.
  const atRiskCount = useMemo(
    () => projects.filter((p) => computeHealth(p)?.level === 'at-risk').length,
    [projects],
  )
  const delayedCount = useMemo(
    () => projects.filter((p) => computeHealth(p)?.level === 'delayed').length,
    [projects],
  )

  const filtered = useMemo(() => {
    let list = projects
    if (statusFilter) list = list.filter((p) => p.status === statusFilter)
    if (priorityFilter) list = list.filter((p) => p.priority === priorityFilter)
    if (roleFilter) list = list.filter((p) => p.myRole === roleFilter)
    if (ownerFilter) list = list.filter((p) => p.ownerId === ownerFilter)
    if (userFilter)
      list = list.filter((p) => p.ownerId === userFilter || p.members.some((m) => m.userId === userFilter))
    if (derivedFilter === 'overdue') {
      list = list.filter((p) => computeOverdue(p).overdue)
    } else if (derivedFilter === 'atRisk') {
      list = list.filter((p) => computeHealth(p)?.level === 'at-risk')
    } else if (derivedFilter === 'delayed') {
      list = list.filter((p) => computeHealth(p)?.level === 'delayed')
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false))
    }
    return sortProjects(list, sort)
  }, [projects, statusFilter, priorityFilter, roleFilter, ownerFilter, userFilter, derivedFilter, search, sort])

  // Blocked users are excluded from these person-filter surfaces (dropdown +
  // avatar strip) — they're active-member pickers, not historical records, and
  // a blocked user can no longer log in or do work. Membership rows themselves
  // are untouched; unblocking makes them reappear here automatically.
  const userOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of projects) {
      if (!p.owner.blocked && !seen.has(p.ownerId)) seen.set(p.ownerId, p.owner.name || p.owner.email || p.ownerId)
      for (const m of p.members) {
        if (!m.user.blocked && !seen.has(m.userId)) seen.set(m.userId, m.user.name || m.user.email || m.userId)
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [projects])

  const userList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; image?: string | null }>()
    for (const p of projects) {
      if (!p.owner.blocked && !seen.has(p.ownerId))
        seen.set(p.ownerId, { id: p.ownerId, name: p.owner.name || p.owner.email || p.ownerId, image: p.owner.image })
      for (const m of p.members) {
        if (!m.user.blocked && !seen.has(m.userId))
          seen.set(m.userId, { id: m.userId, name: m.user.name || m.user.email || m.userId, image: m.user.image })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  const hasActiveFilters = !!(statusFilter || priorityFilter || roleFilter || ownerFilter || userFilter || derivedFilter || search.trim())
  const clearFilters = () => {
    setStatusFilter(null)
    setPriorityFilter(null)
    setRoleFilter(null)
    setOwnerFilter(null)
    setUserFilter(null)
    setDerivedFilter(null)
    setSearch('')
  }

  return {
    canCreateProject,
    createOpen, setCreateOpen,
    scope, setScope,
    statusFilter, setStatusFilter,
    priorityFilter, setPriorityFilter,
    userFilter, setUserFilter,
    userFilterMode, setUserFilterMode,
    derivedFilter, setDerivedFilter,
    search, setSearch,
    sort, setSort,
    view, setView,
    groupByStatus, setGroupByStatus,
    density, setDensity,
    projectsQ,
    create,
    projects,
    totalProjects,
    isTruncated,
    statusCounts,
    overdueCount,
    atRiskCount,
    delayedCount,
    filtered,
    userOptions,
    userList,
    hasActiveFilters,
    clearFilters,
    openProject,
  }
}
