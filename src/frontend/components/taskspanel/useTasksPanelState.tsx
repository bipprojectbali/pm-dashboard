import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../hooks/useAuth'
import { downloadTasksCsv } from '../../lib/csv'
import { DeleteReasonModal } from './DeleteReasonModal'
import { api, buildTasksQueryString, filterAndSortTasks } from './helpers'
import type { AssigneeOption, ProjectOption, TagListItem, TaskListItem } from './types'
import { buildExportRows, useTaskMutations } from './useTaskMutations'

export const PAGE_SIZE = 25

interface Opts {
  projectId?: string
  onProjectChange?: (id: string | null) => void
  canWriteOverride?: boolean
  initialAssigneeFilter?: string | null
  initialSort?: { by: string; dir: 'asc' | 'desc' }
}

export function useTasksPanelState({
  projectId,
  onProjectChange,
  canWriteOverride,
  initialAssigneeFilter,
  initialSort,
}: Opts) {
  const qc = useQueryClient()
  const session = useSession()
  const systemRole = session.data?.user?.role ?? null
  const isAdmin = systemRole === 'ADMIN' || systemRole === 'SUPER_ADMIN'
  const currentUserId = session.data?.user?.id ?? null

  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [trashView, setTrashView] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(initialAssigneeFilter ?? null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'overdue' | 'openOnly' | 'blocked' | 'nodue' | null>(null)
  const [dueDateRange, setDueDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string | null>(initialSort?.by ?? null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort?.dir ?? 'asc')
  const [page, setPage] = useState(1)
  const [showCharts, setShowCharts] = useLocalStorage({ key: 'pm:tasks:show-charts', defaultValue: true })
  const [view, setView] = useLocalStorage<'table' | 'gantt' | 'kanban'>({ key: 'pm:tasks:view', defaultValue: 'table' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const activeProjectId = projectId ?? null
  const changeProject = (id: string | null) => {
    setTagFilter(null)
    setPhaseFilter(null)
    onProjectChange?.(id)
  }
  const openTask = (id: string) => setDrawerTaskId(id)
  const closeTask = () => {
    setDrawerTaskId(null)
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const { create, bulkCreate, deleteOne, deleteBulk } = useTaskMutations({
    onCreateSuccess: () => setCreateOpen(false),
    onDeleteOneSuccess: (id) =>
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
    onClearSelection: clearSelection,
  })

  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectOption[] }>('/api/projects'),
  })
  const tagsQ = useQuery({
    queryKey: ['tags', activeProjectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${activeProjectId}/tags`),
    enabled: !!activeProjectId,
  })
  const phasesQ = useQuery({
    queryKey: ['phases', activeProjectId],
    queryFn: () =>
      api<{ phases: Array<{ id: string; title: string; status: string; _count: { tasks: number } }> }>(
        `/api/projects/${activeProjectId}/phases`,
      ),
    enabled: !!activeProjectId,
  })
  // Anggota project aktif untuk dropdown filter assignee (reuse pola modal Create Task).
  const membersQ = useQuery({
    queryKey: ['project-members', activeProjectId, 'tasks-filter'],
    queryFn: () =>
      api<{ project: { members: Array<{ user: { id: string; name: string } }> } }>(`/api/projects/${activeProjectId}`),
    enabled: !!activeProjectId,
  })
  const members: AssigneeOption[] = useMemo(
    () => (membersQ.data?.project.members ?? []).map((m) => ({ id: m.user.id, name: m.user.name })),
    [membersQ.data],
  )

  const query = buildTasksQueryString({
    projectId: activeProjectId,
    status,
    kind,
    assigneeFilter,
    currentUserId,
    tagFilter,
    phaseFilter,
    view,
    page,
    pageSize: PAGE_SIZE,
    search,
    priorityFilter,
    quickFilter,
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', query],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number; limit: number; offset: number }>(
        `/api/tasks${query ? `?${query}` : ''}`,
      ),
    enabled: view !== 'kanban',
  })
  const chartQuery = buildTasksQueryString({
    projectId: activeProjectId,
    status: null,
    kind: null,
    assigneeFilter: null,
    currentUserId,
    tagFilter: null,
    phaseFilter: null,
    view: 'table',
    page: 1,
    pageSize: 500,
    search: '',
    priorityFilter: null,
    quickFilter: null,
  })
  const chartTasksQ = useQuery({
    queryKey: ['tasks-chart', chartQuery],
    queryFn: () => api<{ tasks: TaskListItem[] }>(`/api/tasks?${chartQuery}`),
    staleTime: 60_000,
  })

  const projects = projectsQ.data?.projects ?? []
  const writableProjects = projects.filter((p) => {
    if (projectId && p.id === projectId && canWriteOverride !== undefined) return canWriteOverride
    if (isAdmin) return true
    if (typeof p.canWrite === 'boolean') return p.canWrite
    return p.myRole !== null && p.myRole !== 'VIEWER'
  })
  const leadProjectIds = useMemo(() => {
    const s = new Set<string>()
    for (const p of projects) if (p.myRole === 'OWNER' || p.myRole === 'PM') s.add(p.id)
    return s
  }, [projects])
  const canDeleteTask = useCallback(
    (t: TaskListItem) =>
      isAdmin || (currentUserId != null && t.reporter.id === currentUserId) || leadProjectIds.has(t.projectId),
    [isAdmin, currentUserId, leadProjectIds],
  )

  const rawTasks = tasksQ.data?.tasks ?? []
  const total = tasksQ.data?.total ?? 0
  const tasks = useMemo(
    () => filterAndSortTasks(rawTasks, quickFilter, dueDateRange, sortBy, sortDir),
    [rawTasks, quickFilter, dueDateRange, sortBy, sortDir],
  )
  const activeProject = activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) if (taskById.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    })
  }, [taskById])
  const deletableTasks = useMemo(() => tasks.filter(canDeleteTask), [tasks, canDeleteTask])
  const deletableIds = useMemo(() => deletableTasks.map((t) => t.id), [deletableTasks])
  const deletableSelected = useMemo(
    () =>
      Array.from(selectedIds).filter((id) => {
        const t = taskById.get(id)
        return t ? canDeleteTask(t) : false
      }),
    [selectedIds, taskById, canDeleteTask],
  )
  const allDeletableSelected = deletableIds.length > 0 && deletableIds.every((id) => selectedIds.has(id))
  const someDeletableSelected = deletableSelected.length > 0 && !allDeletableSelected
  const toggleAllSelection = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allDeletableSelected) for (const id of deletableIds) next.delete(id)
      else for (const id of deletableIds) next.add(id)
      return next
    })
  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirmDeleteByIds = (ids: string[]) => {
    if (ids.length === 0) return
    modals.open({
      title: `Hapus ${ids.length} task terpilih?`,
      size: 'sm',
      children: (
        <DeleteReasonModal
          label={`${ids.length} task akan dipindahkan ke Trash. Hanya task yang kamu miliki yang ikut terhapus.`}
          onConfirm={(reason) => deleteBulk.mutate({ ids, reason })}
        />
      ),
    })
  }
  const confirmDeleteOne = (t: TaskListItem) =>
    modals.open({
      title: 'Hapus task ini?',
      size: 'sm',
      children: (
        <DeleteReasonModal
          label={`"${t.title}" akan dipindahkan ke Trash. Bisa di-restore dalam 30 hari.`}
          onConfirm={(reason) => deleteOne.mutate({ id: t.id, reason })}
        />
      ),
    })
  const confirmDeleteSelected = () => confirmDeleteByIds(deletableSelected)

  const handleExport = () => {
    const projectSlug = activeProject?.name.replace(/\s+/g, '-').toLowerCase() ?? 'all'
    const date = new Date().toLocaleDateString('id-ID').replace(/\//g, '-')
    downloadTasksCsv(buildExportRows(tasks), `tasks-${projectSlug}-${status ?? 'all'}-${date}.csv`)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [
    activeProjectId,
    status,
    kind,
    assigneeFilter,
    tagFilter,
    phaseFilter,
    search,
    quickFilter,
    dueDateRange,
    priorityFilter,
    sortBy,
    sortDir,
  ])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset tag/phase filters when the active project changes
  useEffect(() => {
    setPhaseFilter(null)
    setTagFilter(null)
  }, [activeProjectId])

  const showClearAll = !!(
    quickFilter ||
    search ||
    dueDateRange[0] ||
    dueDateRange[1] ||
    priorityFilter ||
    sortBy ||
    phaseFilter ||
    assigneeFilter
  )
  const clearAllFilters = () => {
    setQuickFilter(null)
    setSearch('')
    setDueDateRange([null, null])
    setPriorityFilter(null)
    setSortBy(null)
    setSortDir('asc')
    setPhaseFilter(null)
    setAssigneeFilter(null)
  }

  return {
    projects,
    writableProjects,
    activeProjectId,
    activeProject,
    canDeleteTask,
    tasksQ,
    tagsQ,
    phasesQ,
    chartTasksQ,
    rawTasks,
    tasks,
    total,
    totalPages,
    safePage,
    status,
    setStatus,
    kind,
    setKind,
    assigneeFilter,
    setAssigneeFilter,
    members,
    currentUserId,
    tagFilter,
    setTagFilter,
    phaseFilter,
    setPhaseFilter,
    search,
    setSearch,
    quickFilter,
    setQuickFilter,
    dueDateRange,
    setDueDateRange,
    priorityFilter,
    setPriorityFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    showClearAll,
    clearAllFilters,
    view,
    setView,
    showCharts,
    setShowCharts,
    trashView,
    setTrashView,
    page,
    setPage,
    selectedIds,
    toggleSelection,
    toggleAllSelection,
    clearSelection,
    allDeletableSelected,
    someDeletableSelected,
    deletableTasks,
    deletableSelected,
    create,
    bulkCreate,
    deleteOne,
    deleteBulk,
    openTask,
    closeTask,
    changeProject,
    confirmDeleteOne,
    confirmDeleteByIds,
    confirmDeleteSelected,
    handleExport,
    drawerTaskId,
    createOpen,
    setCreateOpen,
  }
}
