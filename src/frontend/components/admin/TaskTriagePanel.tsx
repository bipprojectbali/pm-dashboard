import { ActionIcon, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { TriageFilters } from './tasktriagepanel/TriageFilters'
import { TriageStatCards } from './tasktriagepanel/TriageStatCards'
import { TriageTable } from './tasktriagepanel/TriageTable'
import { PAGE_SIZE, isOpen, isOverdue, isStale, type QuickFilter, type TriageTask } from './tasktriagepanel/types'

export function TaskTriagePanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'task-triage'],
    queryFn: () =>
      fetch('/api/tasks?limit=500', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        tasks: TriageTask[]
      }>,
    refetchInterval: 30_000,
  })

  const tasks = data?.tasks ?? []
  const openTasks = useMemo(() => tasks.filter(isOpen), [tasks])

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) map.set(t.project.id, t.project.name)
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [tasks])

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) {
      if (t.assignee) map.set(t.assignee.id, `${t.assignee.name} (${t.assignee.email})`)
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [tasks])

  const stats = useMemo(() => ({
    total: openTasks.length,
    overdue: openTasks.filter(isOverdue).length,
    unassigned: openTasks.filter((t) => !t.assignee).length,
    stale: openTasks.filter(isStale).length,
    blocked: openTasks.filter((t) => t._count.blockedBy > 0).length,
  }), [openTasks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (quick === 'overdue' && !isOverdue(t)) return false
      if (quick === 'unassigned' && (t.assignee || !isOpen(t))) return false
      if (quick === 'blocked' && (t._count.blockedBy === 0 || !isOpen(t))) return false
      if (quick === 'stale' && !isStale(t)) return false
      if (projectFilter && t.project.id !== projectFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (priorityFilter && t.priority !== priorityFilter) return false
      if (assigneeFilter === '__none__' && t.assignee) return false
      if (assigneeFilter && assigneeFilter !== '__none__' && t.assignee?.id !== assigneeFilter) return false
      if (q) {
        const hay = `${t.title} ${t.project.name} ${t.assignee?.name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tasks, quick, projectFilter, statusFilter, priorityFilter, assigneeFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedFiltered = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [quick, projectFilter, statusFilter, priorityFilter, assigneeFilter, search])

  const openTask = (t: TriageTask) => {
    navigate({ to: '/pm', search: { tab: 'tasks', projectId: t.project.id, taskId: t.id } })
  }

  const clearFilters = () => {
    setSearch('')
    setProjectFilter(null)
    setStatusFilter(null)
    setPriorityFilter(null)
    setAssigneeFilter(null)
    setQuick('all')
  }

  const hasFilters =
    !!search || !!projectFilter || !!statusFilter || !!priorityFilter || !!assigneeFilter || quick !== 'all'

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={3}>Task Triage</Title>
            <InfoTip
              width={360}
              label="Panel untuk mencari task yang butuh perhatian lintas project: overdue, unassigned, blocked by dependency, atau stale >7 hari. Data polling 30 detik, di-cap 500 task terbaru."
            />
          </Group>
          <Text size="sm" c="dimmed">
            Fokus ke task yang butuh perhatian di seluruh project.
          </Text>
        </div>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" onClick={() => refetch()} loading={isFetching}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <TriageStatCards stats={stats} />
      <TriageFilters
        search={search} onSearchChange={setSearch}
        projectFilter={projectFilter} onProjectFilterChange={setProjectFilter}
        projectOptions={projectOptions}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter} onPriorityFilterChange={setPriorityFilter}
        assigneeFilter={assigneeFilter} onAssigneeFilterChange={setAssigneeFilter}
        assigneeOptions={assigneeOptions}
        quick={quick} onQuickChange={setQuick}
        filteredCount={filtered.length} totalCount={tasks.length}
        hasFilters={hasFilters} onClearFilters={clearFilters}
      />
      <TriageTable
        pagedTasks={pagedFiltered}
        isLoading={isLoading}
        filteredCount={filtered.length}
        page={safePage}
        onPageChange={setPage}
        onTaskClick={openTask}
      />
    </Stack>
  )
}
