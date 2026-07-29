import { useLocalStorage } from '@mantine/hooks'
import { useEffect, useState } from 'react'

// Filter + view state for the tasks panel: every filter control, the page
// cursor, the view/display toggles, plus the two reset effects. Extracted from
// useTasksPanelState to keep that file within file-health limits; behavior is
// unchanged. Composed back in via `...filters` spread.
export function useTaskFilters({
  initialAssigneeFilter,
  initialSort,
  activeProjectId,
}: {
  initialAssigneeFilter?: string | null
  initialSort?: { by: string; dir: 'asc' | 'desc' }
  activeProjectId: string | null
}) {
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
  const [trashView, setTrashView] = useState(false)

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
    status,
    setStatus,
    kind,
    setKind,
    assigneeFilter,
    setAssigneeFilter,
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
    page,
    setPage,
    showCharts,
    setShowCharts,
    view,
    setView,
    trashView,
    setTrashView,
    showClearAll,
    clearAllFilters,
  }
}
