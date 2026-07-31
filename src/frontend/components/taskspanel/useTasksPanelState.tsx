import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../hooks/useAuth'
import { downloadTasksCsv } from '../../lib/csv'
import { DeleteReasonModal } from './DeleteReasonModal'
import type { TaskListItem } from './types'
import { useTaskFilters } from './useTaskFilters'
import { buildExportRows, useTaskMutations } from './useTaskMutations'
import { useTaskQueries } from './useTaskQueries'

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

  const activeProjectId = projectId ?? null
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // Bumped on every successful create so CreateTaskModal clears its form only
  // then (a Cancel/close keeps the entered values on purpose).
  const [createResetSignal, setCreateResetSignal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const filters = useTaskFilters({ initialAssigneeFilter, initialSort, activeProjectId })

  const changeProject = (id: string | null) => {
    filters.setTagFilter(null)
    filters.setPhaseFilter(null)
    onProjectChange?.(id)
  }
  const openTask = (id: string) => setDrawerTaskId(id)
  const closeTask = () => {
    setDrawerTaskId(null)
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const { create, bulkCreate, deleteOne, deleteBulk } = useTaskMutations({
    onCreateSuccess: () => {
      setCreateOpen(false)
      setCreateResetSignal((n) => n + 1)
    },
    onDeleteOneSuccess: (id) =>
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
    onClearSelection: clearSelection,
  })

  const queries = useTaskQueries({
    activeProjectId,
    projectId,
    canWriteOverride,
    isAdmin,
    currentUserId,
    status: filters.status,
    kind: filters.kind,
    assigneeFilter: filters.assigneeFilter,
    tagFilter: filters.tagFilter,
    phaseFilter: filters.phaseFilter,
    view: filters.view,
    page: filters.page,
    pageSize: PAGE_SIZE,
    search: filters.search,
    priorityFilter: filters.priorityFilter,
    quickFilter: filters.quickFilter,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    dueDateRange: filters.dueDateRange,
  })
  const { tasksQ, projects, leadProjectIds } = queries

  const canDeleteTask = useCallback(
    (t: TaskListItem) =>
      isAdmin || (currentUserId != null && t.reporter.id === currentUserId) || leadProjectIds.has(t.projectId),
    [isAdmin, currentUserId, leadProjectIds],
  )

  // Filtering + sorting now happen server-side (see buildTasksQueryString), so
  // the rows returned for this page are already the correct, ordered slice —
  // no client-side re-filter/re-sort (which only saw the current page).
  const rawTasks = tasksQ.data?.tasks ?? []
  const total = tasksQ.data?.total ?? 0
  const tasks = rawTasks
  const activeProject = activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(filters.page, totalPages)

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
    downloadTasksCsv(buildExportRows(tasks), `tasks-${projectSlug}-${filters.status ?? 'all'}-${date}.csv`)
  }

  return {
    ...filters,
    ...queries,
    activeProjectId,
    activeProject,
    canDeleteTask,
    rawTasks,
    tasks,
    total,
    totalPages,
    safePage,
    currentUserId,
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
    createResetSignal,
  }
}
