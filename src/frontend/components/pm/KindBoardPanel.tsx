import { ActionIcon, Button, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { TbPlus, TbRefresh } from 'react-icons/tb'
import { TriageFilters } from '@/frontend/components/admin/tasktriagepanel/TriageFilters'
import { TriageStatCards } from '@/frontend/components/admin/tasktriagepanel/TriageStatCards'
import { TriageTable } from '@/frontend/components/admin/tasktriagepanel/TriageTable'
import {
  isOpen,
  isOverdue,
  isStale,
  PAGE_SIZE,
  type QuickFilter,
  type TriageTask,
} from '@/frontend/components/admin/tasktriagepanel/types'
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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pm', 'kind-board', kind],
    queryFn: () =>
      fetch(`/api/tasks?kind=${kind}&limit=200`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        tasks: TriageTask[]
      }>,
    refetchInterval: 30_000,
  })

  const projectsQ = useQuery({
    queryKey: ['projects', 'writable', 'kind-board'],
    queryFn: () => api<{ projects: ProjectOption[] }>('/api/projects'),
  })

  const create = useMutation({
    mutationFn: (body: { projectId: string; title: string; description: string; kind: string }) =>
      api('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm', 'kind-board', kind] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
    },
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

  const stats = useMemo(
    () => ({
      total: openTasks.length,
      overdue: openTasks.filter(isOverdue).length,
      unassigned: openTasks.filter((t) => !t.assignee).length,
      stale: openTasks.filter(isStale).length,
      blocked: openTasks.filter((t) => t._count.blockedBy > 0).length,
    }),
    [openTasks],
  )

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

  const writableProjects = (projectsQ.data?.projects ?? []).filter((p) =>
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

      <TriageStatCards stats={stats} />
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

      <CreateTaskModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={writableProjects}
        defaultProjectId={writableProjects[0]?.id ?? null}
        defaultKind={kind}
        onSubmit={(body) => create.mutate(body)}
        onBulkSubmit={() => {}}
        loading={create.isPending}
        error={create.error ? (create.error as Error).message : undefined}
        tagsByProject={[]}
      />
    </Stack>
  )
}
