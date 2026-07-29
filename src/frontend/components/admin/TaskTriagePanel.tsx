import { ActionIcon, Alert, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbInfoCircle, TbRefresh } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { TriageFilters } from './tasktriagepanel/TriageFilters'
import { TriageStatCards, type TriageStats } from './tasktriagepanel/TriageStatCards'
import { TriageTable } from './tasktriagepanel/TriageTable'
import { isOpen, isOverdue, isStale, PAGE_SIZE, type QuickFilter, type TriageTask } from './tasktriagepanel/types'

// The table pulls at most this many rows (the server hard-caps /api/tasks at
// 200). Stat cards do NOT rely on this — they come from the /overview/triage
// aggregate which counts in-DB, so the numbers stay correct beyond the cap.
// /api/tasks orders by status enum-order (OPEN first … CLOSED last), so the
// open tasks that triage cares about stay within the fetched window even when
// truncated; the banner surfaces any overflow instead of hiding it.
const TABLE_FETCH_LIMIT = 200

const EMPTY_STATS: TriageStats = { total: 0, overdue: 0, unassigned: 0, blocked: 0, stale: 0 }

export function TaskTriagePanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [page, setPage] = useState(1)

  // Accurate, un-capped, IDEA-excluded counts for the stat cards (single source
  // of truth shared with the sidebar "task overdue" badge via computeRiskReport's
  // matching overdue definition). See src/lib/admin-overview/triage.ts.
  const statsQ = useQuery({
    queryKey: ['admin', 'task-triage', 'stats'],
    queryFn: () =>
      fetch('/api/admin/overview/triage', { credentials: 'include' }).then((r) => r.json()) as Promise<TriageStats>,
    refetchInterval: 30_000,
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'task-triage'],
    queryFn: () =>
      fetch(`/api/tasks?limit=${TABLE_FETCH_LIMIT}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        tasks: TriageTask[]
        total: number
      }>,
    refetchInterval: 30_000,
  })

  // Exclude IDEA from the browsing table too, so it agrees with the stat cards
  // (ideas are backlog captures, not triage-able committed work).
  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => t.kind !== 'IDEA'), [data])
  const serverTotal = data?.total ?? 0
  const truncated = (data?.tasks.length ?? 0) >= TABLE_FETCH_LIMIT && serverTotal > TABLE_FETCH_LIMIT
  const stats = statsQ.data ?? EMPTY_STATS

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
              label="Panel untuk mencari task yang butuh perhatian lintas project: overdue, unassigned, blocked by dependency, atau stale >7 hari. Kartu statistik dihitung langsung di server (akurat, mengecualikan IDEA); tabel di bawah menampilkan hingga 200 task terbaru untuk ditelusuri. Data polling 30 detik."
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
      {truncated && (
        <Alert color="yellow" variant="light" icon={<TbInfoCircle size={16} />} py="xs">
          <Text size="xs">
            Tabel menampilkan 200 task terbaru dari {serverTotal} total — gunakan filter (project/status/prioritas) atau
            buka tab project untuk menelusuri sisanya. Kartu statistik di atas tetap menghitung seluruh task.
          </Text>
        </Alert>
      )}
      <TriageFilters
        search={search}
        onSearchChange={setSearch}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        projectOptions={projectOptions}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        assigneeOptions={assigneeOptions}
        quick={quick}
        onQuickChange={setQuick}
        filteredCount={filtered.length}
        totalCount={tasks.length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
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
