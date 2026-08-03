import { ActionIcon, Button, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbPlus, TbRefresh } from 'react-icons/tb'
import { TriageFilters } from '@/frontend/components/admin/tasktriagepanel/TriageFilters'
import { TriageStatCards } from '@/frontend/components/admin/tasktriagepanel/TriageStatCards'
import { TriageTable } from '@/frontend/components/admin/tasktriagepanel/TriageTable'
import { PAGE_SIZE, type QuickFilter, type TriageTask } from '@/frontend/components/admin/tasktriagepanel/types'
import { CreateTaskModal } from '@/frontend/components/CreateTaskModal'
import type { ProjectOption } from '@/frontend/components/createtaskmodal/types'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { api } from '@/frontend/components/taskspanel/helpers'

/**
 * Cross-project board for a single TaskKind (TICKET or IDEA). Reuses the admin
 * triage sub-components but scopes the fetch to one kind so PMs get a dedicated
 * "papan gabungan" per the meeting workflow. Data still lives in `Task`.
 */
export function KindBoardPanel({
  kind,
  title,
  description,
  createLabel,
}: {
  kind: 'TICKET' | 'IDEA'
  title: string
  description: string
  createLabel: string
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  // Bumped on successful create so the modal clears its form only then.
  const [createResetSignal, setCreateResetSignal] = useState(0)

  // Server-side query string for the table page. Every filter is sent to the
  // backend so results (and the row count) stay correct across pages — the old
  // client-side filtering over a 200-cap page under-counted once a board grew.
  const STALE_DAYS = 7
  const tableParams = useMemo(() => {
    const p = new URLSearchParams({ kind, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })
    if (projectFilter) p.set('projectId', projectFilter)
    if (statusFilter) p.set('status', statusFilter)
    if (priorityFilter) p.set('priority', priorityFilter)
    if (assigneeFilter === '__none__') p.set('unassigned', '1')
    else if (assigneeFilter) p.set('assigneeId', assigneeFilter)
    if (search.trim()) p.set('search', search.trim())
    if (quick === 'overdue') p.set('overdueOnly', '1')
    else if (quick === 'unassigned') p.set('unassigned', '1')
    else if (quick === 'blocked') p.set('blocked', '1')
    else if (quick === 'stale') p.set('staleDays', String(STALE_DAYS))
    return p.toString()
  }, [kind, page, projectFilter, statusFilter, priorityFilter, assigneeFilter, search, quick])

  const tableQ = useQuery({
    queryKey: ['pm', 'kind-board', kind, tableParams],
    queryFn: () =>
      fetch(`/api/tasks?${tableParams}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        tasks: TriageTask[]
        total: number
      }>,
    refetchInterval: 30_000,
  })

  // Accurate, un-capped stat-card counts from the DB (visibility-scoped to this
  // user). Kept separate from the table page so the cards never depend on which
  // page/filter is showing — same split as the admin Task Triage panel.
  const statsQ = useQuery({
    queryKey: ['pm', 'kind-board', kind, 'stats'],
    queryFn: () =>
      fetch(`/api/tasks/kind-board-stats?kind=${kind}&staleDays=${STALE_DAYS}`, { credentials: 'include' }).then((r) =>
        r.json(),
      ) as Promise<{ total: number; overdue: number; unassigned: number; blocked: number; stale: number }>,
    refetchInterval: 30_000,
  })

  const projectsQ = useQuery({
    queryKey: ['projects', 'writable', 'kind-board'],
    queryFn: () => api<{ projects: ProjectOption[] }>('/api/projects'),
  })

  const create = useMutation({
    mutationFn: (body: {
      projectId: string
      title: string
      description: string
      kind: string
      assigneeId?: string | null
    }) =>
      api('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm', 'kind-board', kind] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
      setCreateResetSignal((n) => n + 1)
    },
  })

  const tasks = tableQ.data?.tasks ?? []
  const total = tableQ.data?.total ?? 0
  const isLoading = tableQ.isLoading
  const isFetching = tableQ.isFetching || statsQ.isFetching
  const refetch = () => {
    void tableQ.refetch()
    void statsQ.refetch()
  }
  const stats = statsQ.data ?? { total: 0, overdue: 0, unassigned: 0, blocked: 0, stale: 0 }
  const allProjects = projectsQ.data?.projects ?? []

  // Project filter options: every project the user can see (not just those on
  // the current page), so the dropdown is complete regardless of pagination.
  const projectOptions = useMemo(() => allProjects.map((p) => ({ value: p.id, label: p.name })), [allProjects])
  // Assignee options are a convenience derived from the current page; the actual
  // filtering is server-side (assigneeId / unassigned), so a name missing from
  // this page's rows still filters correctly once selected from another page.
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) {
      if (t.assignee) map.set(t.assignee.id, `${t.assignee.name} (${t.assignee.email})`)
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [tasks])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

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

  const writableProjects = allProjects.filter((p) =>
    typeof p.canWrite === 'boolean' ? p.canWrite : p.myRole !== null && p.myRole !== 'VIEWER',
  )

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={3}>{title}</Title>
            <InfoTip width={360} label={description} />
          </Group>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" onClick={() => refetch()} loading={isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Button
            size="xs"
            leftSection={<TbPlus size={14} />}
            onClick={() => setCreateOpen(true)}
            disabled={writableProjects.length === 0}
          >
            {createLabel}
          </Button>
        </Group>
      </Group>

      <TriageStatCards stats={stats} hideOverdueBlocked={kind === 'IDEA'} />
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
        filteredCount={total}
        totalCount={stats.total}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        hideOverdueBlocked={kind === 'IDEA'}
      />
      <TriageTable
        pagedTasks={tasks}
        isLoading={isLoading}
        filteredCount={total}
        page={safePage}
        onPageChange={setPage}
        onTaskClick={openTask}
      />

      <CreateTaskModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={writableProjects}
        defaultProjectId={writableProjects[0]?.id ?? null}
        defaultKind={kind}
        heading={kind === 'TICKET' ? 'Create Ticket' : 'Create Idea'}
        onSubmit={(body) => create.mutate(body)}
        onBulkSubmit={() => {}}
        loading={create.isPending}
        error={create.error ? (create.error as Error).message : undefined}
        tagsByProject={[]}
        resetSignal={createResetSignal}
      />
    </Stack>
  )
}
