import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  FileButton,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbArrowsMaximize,
  TbArrowsMinimize,
  TbChartBar,
  TbChevronRight,
  TbClock,
  TbDownload,

  TbChevronLeft,
  TbFileImport,
  TbFilter,
  TbListCheck,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbTag,
  TbTrash,
  TbUpload,
  TbUserQuestion,
  TbX,
} from 'react-icons/tb'
import { useLocalStorage } from '@mantine/hooks'
import { useSession } from '../hooks/useAuth'
import { downloadSampleCsv, parseTaskCsv, TASK_CSV_HEADERS, type RowError } from '../lib/csv'
import { notifyError, notifySuccess } from '../lib/notify'
import { EChart } from './charts/EChart'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskKind = 'TASK' | 'BUG' | 'QC'

interface TaskUser {
  id: string
  name: string
  email: string
  role: string
}

interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

interface TaskListItem {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  route: string | null
  reporter: TaskUser
  assignee: TaskUser | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  actualHours: number | null
  progressPercent: number | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  tags: TaskTag[]
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

interface TagListItem {
  id: string
  projectId: string
  name: string
  color: string
}

interface ProjectOption {
  id: string
  name: string
  myRole: 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' | null
  canWrite?: boolean
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  READY_FOR_QC: 'yellow',
  REOPENED: 'orange',
  CLOSED: 'green',
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

const KIND_COLOR: Record<TaskKind, string> = {
  TASK: 'blue',
  BUG: 'red',
  QC: 'teal',
}

const STICKY_COL_HEADER: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  background: 'var(--mantine-color-body)',
  minWidth: 280,
  width: 280,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}

const STICKY_COL_CELL: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
  minWidth: 280,
  width: 280,
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function TasksPanel({
  projectId,
  onProjectChange,
  onBackToProjects,
  canWriteOverride,
}: {
  projectId?: string
  onProjectChange?: (id: string | null) => void
  onBackToProjects?: () => void
  canWriteOverride?: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const session = useSession()
  const systemRole = session.data?.user?.role ?? null
  const isAdmin = systemRole === 'ADMIN' || systemRole === 'SUPER_ADMIN'
  const openTask = (id: string) => {
    navigate({
      to: '/pm',
      search: projectId ? { tab: 'tasks', projectId, taskId: id } : { tab: 'tasks', taskId: id },
    })
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const [showCharts, setShowCharts] = useState(true)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [view, setView] = useLocalStorage<'table' | 'gantt' | 'kanban'>({ key: 'pm:tasks:view', defaultValue: 'table' })
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'overdue' | 'unassigned' | 'openOnly' | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectOption[] }>('/api/projects'),
  })

  const activeProjectId = projectId ?? null

  const changeProject = (id: string | null) => {
    setTagFilter(null)
    onProjectChange?.(id)
  }

  const tagsQ = useQuery({
    queryKey: ['tags', activeProjectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${activeProjectId}/tags`),
    enabled: !!activeProjectId,
  })

  const params = new URLSearchParams()
  if (activeProjectId) params.set('projectId', activeProjectId)
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  if (mine) params.set('mine', '1')
  if (tagFilter) params.set('tagId', tagFilter)
  const query = params.toString()

  const tasksQ = useQuery({
    queryKey: ['tasks', query],
    queryFn: () => api<{ tasks: TaskListItem[] }>(`/api/tasks${query ? `?${query}` : ''}`),
  })

  const create = useMutation({
    mutationFn: (body: {
      projectId: string
      title: string
      description: string
      kind: TaskKind
      priority: TaskPriority
      startsAt: string | null
      dueAt: string | null
      estimateHours: number | null
      tagIds: string[]
    }) =>
      api<{ task: TaskListItem }>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
      notifySuccess({ message: `Task "${res.task.title}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const bulkCreate = useMutation({
    mutationFn: (body: {
      projectId: string
      tasks: Array<{
        title: string
        description: string
        kind: string
        priority: string
        startsAt: string | null
        dueAt: string | null
        estimateHours: number | null
        assigneeEmail: string | null
        tagNames: string[]
      }>
    }) =>
      api<{ count: number; ids: string[] }>('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
      notifySuccess({ message: `${res.count} task berhasil dibuat dari CSV.` })
    },
    onError: (err) => notifyError(err),
  })

  const projects = projectsQ.data?.projects ?? []
  const writableProjects = projects.filter((p) => {
    if (projectId && p.id === projectId && canWriteOverride !== undefined) return canWriteOverride
    if (isAdmin) return true
    if (typeof p.canWrite === 'boolean') return p.canWrite
    return p.myRole !== null && p.myRole !== 'VIEWER'
  })
  const currentUserId = session.data?.user?.id ?? null
  const leadProjectIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of projects) if (p.myRole === 'OWNER' || p.myRole === 'PM') set.add(p.id)
    return set
  }, [projects])
  const canDeleteTask = (t: TaskListItem) => {
    if (isAdmin) return true
    if (currentUserId && t.reporter.id === currentUserId) return true
    return leadProjectIds.has(t.projectId)
  }
  const rawTasks = tasksQ.data?.tasks ?? []
  const tasks = useMemo(() => {
    const now = Date.now()
    const q = search.trim().toLowerCase()
    return rawTasks.filter((t) => {
      if (quickFilter === 'overdue') {
        if (t.status === 'CLOSED' || !t.dueAt || new Date(t.dueAt).getTime() >= now) return false
      } else if (quickFilter === 'unassigned') {
        if (t.assignee) return false
      } else if (quickFilter === 'openOnly') {
        if (t.status === 'CLOSED') return false
      }
      if (q) {
        const hay = `${t.title} ${t.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rawTasks, search, quickFilter])
  const activeProject = activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedTasks = tasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
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
    () => Array.from(selectedIds).filter((id) => {
      const t = taskById.get(id)
      return t ? canDeleteTask(t) : false
    }),
    [selectedIds, taskById, canDeleteTask],
  )
  const allDeletableSelected =
    deletableIds.length > 0 && deletableIds.every((id) => selectedIds.has(id))
  const someDeletableSelected = deletableSelected.length > 0 && !allDeletableSelected
  const toggleAllSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allDeletableSelected) for (const id of deletableIds) next.delete(id)
      else for (const id of deletableIds) next.add(id)
      return next
    })
  }
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const deleteOne = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      notifySuccess({ message: 'Task dihapus.' })
    },
    onError: (err) => notifyError(err),
  })
  const deleteBulk = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number; denied: number; deniedIds: string[] }>('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      clearSelection()
      const tail = res.denied > 0 ? ` (${res.denied} ditolak — bukan kamu yang membuat)` : ''
      notifySuccess({ message: `${res.deleted} task dihapus${tail}.` })
    },
    onError: (err) => notifyError(err),
  })

  const confirmDeleteOne = (t: TaskListItem) => {
    modals.openConfirmModal({
      title: 'Hapus task ini?',
      children: (
        <Text size="sm">
          "{t.title}" akan dihapus permanen beserta komentar, evidence, dan checklist-nya. Tidak bisa di-undo.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteOne.mutate(t.id),
    })
  }
  const confirmDeleteSelected = () => {
    const ids = deletableSelected
    if (ids.length === 0) return
    modals.openConfirmModal({
      title: `Hapus ${ids.length} task terpilih?`,
      children: (
        <Text size="sm">
          {ids.length} task akan dihapus permanen. Hanya task yang kamu boleh hapus (reporter, OWNER/PM, atau admin)
          yang ikut terhapus.
        </Text>
      ),
      labels: { confirm: `Hapus ${ids.length}`, cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteBulk.mutate(ids),
    })
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [activeProjectId, status, kind, mine, tagFilter, search, quickFilter])

  return (
    <Stack gap="md">
      {activeProject ? (
        <Group gap={6} wrap="nowrap">
          {onBackToProjects ? (
            <Tooltip label="Back to projects">
              <ActionIcon variant="subtle" size="sm" onClick={onBackToProjects}>
                <TbArrowLeft size={14} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          <Text
            size="xs"
            c="dimmed"
            style={{ cursor: onBackToProjects ? 'pointer' : undefined }}
            onClick={onBackToProjects}
          >
            Projects
          </Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed">
            {activeProject.name}
          </Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" fw={500}>
            Tasks
          </Text>
        </Group>
      ) : null}
      <Group justify="space-between">
        <div>
          <Title order={3}>{activeProject ? `${activeProject.name} · Tasks` : 'Tasks'}</Title>
          <Text c="dimmed" size="sm">
            {activeProject
              ? `All tasks, bugs, and QC items in ${activeProject.name}.`
              : 'Unified task + bug + QC view across your projects.'}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label={showCharts ? 'Hide dashboard' : 'Show dashboard'}>
            <ActionIcon variant="light" onClick={() => setShowCharts((v) => !v)}>
              <TbChartBar size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={() => tasksQ.refetch()} loading={tasksQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              activeProjectId && canWriteOverride === false
                ? 'Kamu bukan anggota proyek ini — tidak bisa menambah task'
                : writableProjects.length === 0
                  ? 'Tidak ada proyek yang bisa ditulis'
                  : ''
            }
            disabled={!((activeProjectId && canWriteOverride === false) || writableProjects.length === 0)}
          >
            <Button
              leftSection={<TbPlus size={16} />}
              onClick={() => setCreateOpen(true)}
              disabled={writableProjects.length === 0 || (activeProjectId ? canWriteOverride === false : false)}
            >
              New Task
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {showCharts && tasks.length > 0 ? <TaskDashboardOverlay tasks={tasks} /> : null}

      <Card withBorder padding="sm" radius="md">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <TbFilter size={14} />
            {activeProject ? (
              <Badge
                color="blue"
                variant="light"
                size="lg"
                leftSection={<TbTag size={12} />}
                rightSection={
                  <ActionIcon
                    size="xs"
                    variant="transparent"
                    color="blue"
                    onClick={() => changeProject(null)}
                    aria-label="Clear project filter"
                  >
                    <TbX size={12} />
                  </ActionIcon>
                }
              >
                {activeProject.name}
              </Badge>
            ) : (
              <Select
                placeholder="All projects"
                data={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={activeProjectId}
                onChange={changeProject}
                clearable
                size="xs"
                w={220}
              />
            )}
            <Select
              placeholder="All kinds"
              data={['TASK', 'BUG', 'QC']}
              value={kind}
              onChange={setKind}
              clearable
              size="xs"
              w={140}
            />
            <Select
              placeholder="All statuses"
              data={['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']}
              value={status}
              onChange={setStatus}
              clearable
              size="xs"
              w={160}
            />
            {activeProjectId && tagsQ.data?.tags.length ? (
              <Select
                placeholder="All tags"
                leftSection={<TbTag size={12} />}
                data={tagsQ.data.tags.map((t) => ({ value: t.id, label: t.name }))}
                value={tagFilter}
                onChange={setTagFilter}
                clearable
                size="xs"
                w={160}
              />
            ) : null}
            <TextInput
              placeholder="Search title or description"
              leftSection={<TbSearch size={12} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              size="xs"
              w={240}
            />
            <Switch
              label="Assigned to me"
              checked={mine}
              onChange={(e) => setMine(e.currentTarget.checked)}
              size="sm"
            />
            <SegmentedControl
              size="xs"
              value={view}
              onChange={(v) => setView(v as 'table' | 'gantt' | 'kanban')}
              data={[
                { value: 'table', label: 'Table' },
                { value: 'kanban', label: 'Kanban' },
                { value: 'gantt', label: 'Gantt' },
              ]}
              ml="auto"
            />
          </Group>
          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed" fw={500}>
              Quick
            </Text>
            <Badge
              color={quickFilter === 'openOnly' ? 'blue' : 'gray'}
              variant={quickFilter === 'openOnly' ? 'filled' : 'light'}
              size="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => setQuickFilter(quickFilter === 'openOnly' ? null : 'openOnly')}
            >
              Open only
            </Badge>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed" fw={500}>
              Attention
            </Text>
            <Badge
              color={quickFilter === 'overdue' ? 'red' : 'gray'}
              variant={quickFilter === 'overdue' ? 'filled' : 'light'}
              size="sm"
              leftSection={<TbAlertTriangle size={10} />}
              style={{ cursor: 'pointer' }}
              onClick={() => setQuickFilter(quickFilter === 'overdue' ? null : 'overdue')}
            >
              Overdue
            </Badge>
            <Badge
              color={quickFilter === 'unassigned' ? 'orange' : 'gray'}
              variant={quickFilter === 'unassigned' ? 'filled' : 'light'}
              size="sm"
              leftSection={<TbUserQuestion size={10} />}
              style={{ cursor: 'pointer' }}
              onClick={() => setQuickFilter(quickFilter === 'unassigned' ? null : 'unassigned')}
            >
              Unassigned
            </Badge>
            {(quickFilter || search) && (
              <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                ml="auto"
                onClick={() => {
                  setQuickFilter(null)
                  setSearch('')
                }}
              >
                Clear
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {tasks.length === 0 && !tasksQ.isLoading ? (
        <Card withBorder p="xl" radius="md">
          <Stack align="center" gap="sm">
            <TbListCheck size={40} />
            <Text fw={500}>{activeProject ? `No tasks in ${activeProject.name} yet` : 'No tasks found'}</Text>
            <Text size="sm" c="dimmed" ta="center">
              {writableProjects.length === 0
                ? 'Join a project to start creating tasks.'
                : activeProject
                  ? 'Kick things off by creating the first task for this project.'
                  : 'Try clearing filters or creating a new task.'}
            </Text>
            {writableProjects.length > 0 ? (
              <Group gap="xs">
                {activeProjectId && canWriteOverride === false ? null : (
                  <Button leftSection={<TbPlus size={14} />} size="xs" onClick={() => setCreateOpen(true)}>
                    New Task
                  </Button>
                )}
                {activeProject ? (
                  <Button variant="subtle" size="xs" onClick={() => changeProject(null)}>
                    View all tasks
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        </Card>
      ) : view === 'gantt' ? (
        <TasksGanttView tasks={tasks} onSelect={(id) => openTask(id)} />
      ) : view === 'kanban' ? (
        <TasksKanbanView
          tasks={tasks}
          canWrite={
            activeProjectId ? canWriteOverride !== false && writableProjects.length > 0 : writableProjects.length > 0
          }
          onSelect={(id) => openTask(id)}
        />
      ) : (
        <Card withBorder padding={0} radius="md">
          {deletableSelected.length > 0 && (
            <Group justify="space-between" px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {deletableSelected.length} terpilih
                  {allDeletableSelected && deletableTasks.length > 1 ? ' (semua)' : ''}
                </Text>
                <Button size="compact-xs" variant="subtle" onClick={clearSelection}>
                  Bersihkan
                </Button>
              </Group>
              <Button
                size="compact-xs"
                color="red"
                variant="filled"
                leftSection={<TbTrash size={12} />}
                disabled={deleteBulk.isPending}
                loading={deleteBulk.isPending}
                onClick={confirmDeleteSelected}
              >
                Hapus terpilih
              </Button>
            </Group>
          )}
          <Table.ScrollContainer minWidth={activeProject ? 1080 : 1220}>
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" layout="fixed">
            <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <Table.Tr>
                <Table.Th style={{ width: 36 }}>
                  <Tooltip label={allDeletableSelected ? 'Bersihkan pilihan' : `Pilih semua ${deletableTasks.length} task`}>
                    <Checkbox
                      size="xs"
                      aria-label="Pilih semua task"
                      checked={allDeletableSelected}
                      indeterminate={someDeletableSelected}
                      onChange={toggleAllSelection}
                      disabled={deletableTasks.length === 0}
                    />
                  </Tooltip>
                </Table.Th>
                <Table.Th style={STICKY_COL_HEADER}>Title</Table.Th>
                {activeProject ? null : <Table.Th style={{ width: 140 }}>Project</Table.Th>}
                <Table.Th style={{ width: 90 }}>Kind</Table.Th>
                <Table.Th style={{ width: 130 }}>Status</Table.Th>
                <Table.Th style={{ width: 110 }}>Priority</Table.Th>
                <Table.Th style={{ width: 150 }}>Assignee</Table.Th>
                <Table.Th style={{ width: 110 }}>Due</Table.Th>
                <Table.Th style={{ width: 90 }}>Hours</Table.Th>
                <Table.Th style={{ width: 110 }}>Progress</Table.Th>
                <Table.Th style={{ width: 110 }}>Updated</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedTasks.map((t) => {
                const variance =
                  t.estimateHours != null && t.actualHours != null ? t.actualHours - t.estimateHours : null
                const blocked = t._count.blockedBy > 0 && t.status !== 'CLOSED'
                const deletable = canDeleteTask(t)
                const checked = selectedIds.has(t.id)
                return (
                  <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTask(t.id)}>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="xs"
                        aria-label={`Select task ${t.title}`}
                        checked={checked}
                        onChange={() => toggleSelection(t.id)}
                        disabled={!deletable}
                      />
                    </Table.Td>
                    <Table.Td style={STICKY_COL_CELL}>
                      <Stack gap={2}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={500} lineClamp={1}>
                            {t.title}
                          </Text>
                          {blocked ? (
                            <Tooltip label={`Blocked by ${t._count.blockedBy} task(s)`}>
                              <Badge size="xs" color="gray" variant="filled">
                                blocked
                              </Badge>
                            </Tooltip>
                          ) : null}
                        </Group>
                        {t.tags.length > 0 && (
                          <Group gap={4} wrap="wrap">
                            {t.tags.slice(0, 4).map((tt) => (
                              <Badge key={tt.tagId} size="xs" color={tt.tag.color} variant="light">
                                {tt.tag.name}
                              </Badge>
                            ))}
                            {t.tags.length > 4 && (
                              <Text size="xs" c="dimmed">
                                +{t.tags.length - 4}
                              </Text>
                            )}
                          </Group>
                        )}
                      </Stack>
                    </Table.Td>
                    {activeProject ? null : (
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {t.project.name}
                        </Text>
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Badge color={KIND_COLOR[t.kind]} variant="light" size="sm">
                        {t.kind}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={STATUS_COLOR[t.status]} variant="light" size="sm">
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={PRIORITY_COLOR[t.priority]} variant="dot" size="sm">
                        {t.priority}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{t.assignee?.name ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      {t.dueAt ? (
                        (() => {
                          const dueMs = new Date(t.dueAt).getTime()
                          const overdue = t.status !== 'CLOSED' && dueMs < Date.now()
                          return (
                            <Text size="xs" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                              {new Date(t.dueAt).toLocaleDateString()}
                            </Text>
                          )
                        })()
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Tooltip
                        label={
                          t.estimateHours != null || t.actualHours != null
                            ? `estimate: ${t.estimateHours ?? '—'}h · actual: ${t.actualHours ?? '—'}h${variance != null ? ` · ${variance > 0 ? '+' : ''}${variance.toFixed(1)}h` : ''}`
                            : 'No hours logged'
                        }
                      >
                        <Group gap={4} wrap="nowrap">
                          <TbClock size={12} />
                          <Text size="xs" c={variance != null && variance > 0 ? 'red' : 'dimmed'}>
                            {t.actualHours != null
                              ? `${t.actualHours}h`
                              : t.estimateHours != null
                                ? `~${t.estimateHours}h`
                                : '—'}
                          </Text>
                        </Group>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td style={{ minWidth: 90 }}>
                      {t.progressPercent != null ? (
                        <Stack gap={2}>
                          <Text size="xs" c="dimmed">
                            {t.progressPercent}%
                          </Text>
                          <Progress
                            value={t.progressPercent}
                            size="xs"
                            color={t.status === 'CLOSED' ? 'green' : 'blue'}
                          />
                        </Stack>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {deletable ? (
                        <Tooltip label="Hapus task">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={() => confirmDeleteOne(t)}
                            loading={deleteOne.isPending && deleteOne.variables === t.id}
                          >
                            <TbTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
          {tasks.length > PAGE_SIZE && (
            <Group justify="space-between" p="md">
              <Text size="xs" c="dimmed">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tasks.length)} dari {tasks.length}
              </Text>
              <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </Card>
      )}

      <CreateTaskModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={writableProjects}
        defaultProjectId={activeProjectId ?? writableProjects[0]?.id ?? null}
        onSubmit={(body) => create.mutate(body)}
        onBulkSubmit={(body) => bulkCreate.mutate(body)}
        loading={create.isPending || bulkCreate.isPending}
        error={create.error?.message ?? bulkCreate.error?.message}
        tagsByProject={tagsQ.data?.tags ?? []}
      />
    </Stack>
  )
}

const STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#7950f2',
  READY_FOR_QC: '#f59f00',
  REOPENED: '#fd7e14',
  CLOSED: '#40c057',
}

function TaskDashboardOverlay({ tasks }: { tasks: TaskListItem[] }) {
  const { throughput, donut, assignees, stats } = useMemo(() => {
    const days = 14
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const buckets: { date: string; created: number; closed: number }[] = []
    const keyToIdx = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      keyToIdx.set(key, buckets.length)
      buckets.push({ date: key, created: 0, closed: 0 })
    }
    const byStatus = new Map<TaskStatus, number>()
    const byAssignee = new Map<string, { name: string; count: number }>()

    for (const t of tasks) {
      byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1)
      const ck = t.createdAt.slice(0, 10)
      const ci = keyToIdx.get(ck)
      if (ci !== undefined) buckets[ci].created += 1
      if (t.closedAt) {
        const xk = t.closedAt.slice(0, 10)
        const xi = keyToIdx.get(xk)
        if (xi !== undefined) buckets[xi].closed += 1
      }
      if (t.status !== 'CLOSED' && t.assignee) {
        const existing = byAssignee.get(t.assignee.id)
        if (existing) existing.count += 1
        else byAssignee.set(t.assignee.id, { name: t.assignee.name, count: 1 })
      }
    }

    const throughputOpt: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Created', 'Closed'], top: 0, right: 8 },
      grid: { left: 36, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: buckets.map((b) => b.date.slice(5)), boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: 'Created',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: '#228be6' },
          data: buckets.map((b) => b.created),
        },
        {
          name: 'Closed',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: '#40c057' },
          data: buckets.map((b) => b.closed),
        },
      ],
    }

    const donutOpt: EChartsOption = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', itemGap: 8 },
      series: [
        {
          type: 'pie',
          radius: ['55%', '78%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          data: (Array.from(byStatus.entries()) as [TaskStatus, number][]).map(([s, v]) => ({
            name: s.replace('_', ' '),
            value: v,
            itemStyle: { color: STATUS_HEX[s] },
          })),
        },
      ],
    }

    const topAssignees = Array.from(byAssignee.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .reverse()

    const assigneesOpt: EChartsOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 90, right: 16, top: 12, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: topAssignees.map((a) => a.name) },
      series: [
        {
          type: 'bar',
          data: topAssignees.map((a) => a.count),
          itemStyle: { color: '#7950f2', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
          label: { show: true, position: 'right', fontSize: 11 },
        },
      ],
    }

    const openCount = tasks.filter((t) => t.status !== 'CLOSED').length
    const closedCount = tasks.length - openCount
    const overdueCount = tasks.filter(
      (t) => t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt).getTime() < today.getTime(),
    ).length

    return {
      throughput: throughputOpt,
      donut: donutOpt,
      assignees: assigneesOpt,
      stats: { total: tasks.length, open: openCount, closed: closedCount, overdue: overdueCount },
    }
  }, [tasks])

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Total
          </Text>
          <Text fw={700} size="xl">
            {stats.total}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Open
          </Text>
          <Text fw={700} size="xl" c="blue">
            {stats.open}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Closed
          </Text>
          <Text fw={700} size="xl" c="green">
            {stats.closed}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Overdue
          </Text>
          <Text fw={700} size="xl" c={stats.overdue > 0 ? 'red' : undefined}>
            {stats.overdue}
          </Text>
        </Card>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Throughput (last 14 days)
          </Text>
          <EChart option={throughput} height={200} />
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Status breakdown
          </Text>
          <EChart option={donut} height={200} />
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Top assignees (open)
          </Text>
          <EChart option={assignees} height={200} />
        </Card>
      </SimpleGrid>
    </Stack>
  )
}

function CreateTaskModal({
  opened,
  onClose,
  projects,
  defaultProjectId,
  onSubmit,
  onBulkSubmit,
  loading,
  error,
  tagsByProject,
}: {
  opened: boolean
  onClose: () => void
  projects: ProjectOption[]
  defaultProjectId: string | null
  onSubmit: (body: {
    projectId: string
    title: string
    description: string
    kind: TaskKind
    priority: TaskPriority
    startsAt: string | null
    dueAt: string | null
    estimateHours: number | null
    tagIds: string[]
  }) => void
  onBulkSubmit: (body: {
    projectId: string
    tasks: Array<{
      title: string
      description: string
      kind: string
      priority: string
      startsAt: string | null
      dueAt: string | null
      estimateHours: number | null
      assigneeEmail: string | null
      tagNames: string[]
    }>
  }) => void
  loading: boolean
  error?: string
  tagsByProject: TagListItem[]
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<TaskKind>('TASK')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [dueAt, setDueAt] = useState<Date | null>(null)
  const [estimateHours, setEstimateHours] = useState<number | string>('')
  const [tagIds, setTagIds] = useState<string[]>([])

  const [csvText, setCsvText] = useState('')
  const projectTagsQ = useQuery({
    queryKey: ['tags', projectId, 'modal'],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${projectId}/tags`),
    enabled: !!projectId,
  })
  const parsed = useMemo(() => (csvText.trim() ? parseTaskCsv(csvText) : null), [csvText])
  const errorsByRow = useMemo(() => {
    const m = new Map<number, RowError[]>()
    if (!parsed) return m
    for (const e of parsed.errors) {
      if (e.index < 0) continue
      const list = m.get(e.index) ?? []
      list.push(e)
      m.set(e.index, list)
    }
    return m
  }, [parsed])
  const headerErrors = parsed?.errors.filter((e) => e.index < 0) ?? []
  const tagsForProject = projectTagsQ.data?.tags ?? tagsByProject.filter((t) => t.projectId === projectId)
  const knownTagNames = new Set(tagsForProject.map((t) => t.name))
  const unknownTagsByRow = useMemo(() => {
    const m = new Map<number, string[]>()
    if (!parsed) return m
    for (let i = 0; i < parsed.rows.length; i++) {
      const unknown = parsed.rows[i].tagNames.filter((n) => !knownTagNames.has(n))
      if (unknown.length) m.set(i, unknown)
    }
    return m
  }, [parsed, knownTagNames])
  const totalErrors = (parsed?.errors.length ?? 0) + Array.from(unknownTagsByRow.values()).reduce((a, b) => a + b.length, 0)

  const invalidRange = startsAt && dueAt && dueAt < startsAt
  const availableTags = tagsForProject

  const reset = () => {
    setTitle('')
    setDescription('')
    setStartsAt(null)
    setDueAt(null)
    setEstimateHours('')
    setTagIds([])
    setCsvText('')
  }

  const handlePickFile = async (file: File | null) => {
    if (!file) return
    if (!/\.(csv|txt)$/i.test(file.name)) {
      notifyError(new Error('Hanya file .csv yang didukung'))
      return
    }
    const text = await file.text()
    setCsvText(text)
  }

  const submitBulk = () => {
    if (!projectId || !parsed || totalErrors > 0 || parsed.rows.length === 0) return
    onBulkSubmit({
      projectId,
      tasks: parsed.rows.map((r) => ({
        title: r.title,
        description: r.description,
        kind: r.kind,
        priority: r.priority,
        startsAt: r.startsAt,
        dueAt: r.dueAt,
        estimateHours: r.estimateHours,
        assigneeEmail: r.assigneeEmail,
        tagNames: r.tagNames,
      })),
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Create Task"
      size={mode === 'bulk' ? 'xl' : 'md'}
    >
      <Stack gap="sm">
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as 'single' | 'bulk')}
          data={[
            { value: 'single', label: 'Single' },
            { value: 'bulk', label: 'Bulk CSV' },
          ]}
        />
        <Select
          label="Project"
          data={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={projectId}
          onChange={setProjectId}
          required
        />
        {mode === 'single' ? (
          <>
            <TextInput
              label="Title"
              placeholder="What needs to get done?"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
            />
            <Textarea
              label="Description"
              placeholder="Context, acceptance criteria, etc."
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              autosize
              minRows={3}
              maxRows={8}
              required
            />
            <Group grow>
              <Select
                label="Kind"
                data={['TASK', 'BUG', 'QC']}
                value={kind}
                onChange={(v) => setKind((v as TaskKind) || 'TASK')}
              />
              <Select
                label="Priority"
                data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
                value={priority}
                onChange={(v) => setPriority((v as TaskPriority) || 'MEDIUM')}
              />
            </Group>
            <Group grow>
              <DateInput
                label="Start date"
                placeholder="Optional"
                value={startsAt}
                onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
                clearable
              />
              <DateInput
                label="Due date"
                placeholder="Optional"
                value={dueAt}
                onChange={(v) => setDueAt(v ? new Date(v as unknown as string) : null)}
                clearable
                error={invalidRange ? 'Due must be after start' : undefined}
              />
              <NumberInput
                label="Estimate (hours)"
                placeholder="e.g. 2.5"
                value={estimateHours}
                onChange={setEstimateHours}
                min={0}
                step={0.5}
                decimalScale={2}
                leftSection={<TbClock size={14} />}
              />
            </Group>
            {availableTags.length > 0 && (
              <MultiSelect
                label="Tags"
                placeholder="Pick tags"
                data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
                value={tagIds}
                onChange={setTagIds}
                leftSection={<TbTag size={14} />}
                searchable
                clearable
              />
            )}
          </>
        ) : (
          <>
            <Group gap="xs" wrap="wrap">
              <FileButton onChange={handlePickFile} accept=".csv,text/csv">
                {(props) => (
                  <Button {...props} variant="light" leftSection={<TbUpload size={14} />}>
                    Upload CSV
                  </Button>
                )}
              </FileButton>
              <Button
                variant="subtle"
                leftSection={<TbDownload size={14} />}
                onClick={() => downloadSampleCsv()}
              >
                Download sample
              </Button>
              {csvText && (
                <Button variant="subtle" color="gray" onClick={() => setCsvText('')}>
                  Clear
                </Button>
              )}
              <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
                Header wajib: <code>{TASK_CSV_HEADERS.join(',')}</code>
              </Text>
            </Group>
            <Textarea
              label="Atau paste CSV di sini"
              placeholder={`title,description,kind,priority,startsAt,dueAt,estimateHours,assigneeEmail,tagNames\n"Login flow","Email + OAuth",TASK,HIGH,2026-04-25,2026-05-02,6.5,,frontend;auth`}
              value={csvText}
              onChange={(e) => setCsvText(e.currentTarget.value)}
              autosize
              minRows={4}
              maxRows={10}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
            />
            {parsed && (
              <>
                {headerErrors.length > 0 && (
                  <Alert color="red" icon={<TbAlertTriangle size={14} />} title="Header invalid">
                    <Stack gap={2}>
                      {headerErrors.map((e, i) => (
                        <Text key={i} size="xs">
                          {e.message}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
                {parsed.rows.length > 0 && (
                  <Card withBorder padding="xs" radius="md">
                    <Group justify="space-between" mb="xs">
                      <Text size="sm" fw={500}>
                        Preview · {parsed.rows.length} baris
                      </Text>
                      <Badge color={totalErrors > 0 ? 'red' : 'green'} variant="light">
                        {totalErrors > 0 ? `${totalErrors} error` : 'siap import'}
                      </Badge>
                    </Group>
                    <ScrollArea h={260}>
                      <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>Title</Table.Th>
                            <Table.Th>Kind</Table.Th>
                            <Table.Th>Priority</Table.Th>
                            <Table.Th>Start</Table.Th>
                            <Table.Th>Due</Table.Th>
                            <Table.Th>Est (h)</Table.Th>
                            <Table.Th>Assignee</Table.Th>
                            <Table.Th>Tags</Table.Th>
                            <Table.Th>Errors</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {parsed.rows.map((row, i) => {
                            const errs = errorsByRow.get(i) ?? []
                            const unknownTags = unknownTagsByRow.get(i) ?? []
                            const hasError = errs.length > 0 || unknownTags.length > 0
                            return (
                              <Table.Tr
                                key={i}
                                style={{
                                  backgroundColor: hasError ? 'var(--mantine-color-red-light)' : undefined,
                                }}
                              >
                                <Table.Td>{i + 1}</Table.Td>
                                <Table.Td style={{ maxWidth: 220 }}>
                                  <Text size="xs" lineClamp={2}>
                                    {row.title || <Text component="span" c="red">(missing)</Text>}
                                  </Text>
                                </Table.Td>
                                <Table.Td>{row.kind}</Table.Td>
                                <Table.Td>{row.priority}</Table.Td>
                                <Table.Td>{row.startsAt ? row.startsAt.slice(0, 10) : '—'}</Table.Td>
                                <Table.Td>{row.dueAt ? row.dueAt.slice(0, 10) : '—'}</Table.Td>
                                <Table.Td>{row.estimateHours ?? '—'}</Table.Td>
                                <Table.Td>{row.assigneeEmail ?? '—'}</Table.Td>
                                <Table.Td>{row.tagNames.join(', ') || '—'}</Table.Td>
                                <Table.Td>
                                  {hasError ? (
                                    <Stack gap={2}>
                                      {errs.map((e, j) => (
                                        <Text key={j} size="xs" c="red">
                                          {e.field}: {e.message}
                                        </Text>
                                      ))}
                                      {unknownTags.length > 0 && (
                                        <Text size="xs" c="red">
                                          tag tidak ada di project: {unknownTags.join(', ')}
                                        </Text>
                                      )}
                                    </Stack>
                                  ) : (
                                    <Text size="xs" c="green">
                                      ok
                                    </Text>
                                  )}
                                </Table.Td>
                              </Table.Tr>
                            )
                          })}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Card>
                )}
              </>
            )}
          </>
        )}
        {error ? (
          <Text size="sm" c="red">
            {error}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          {mode === 'single' ? (
            <Button
              onClick={() =>
                projectId &&
                onSubmit({
                  projectId,
                  title: title.trim(),
                  description: description.trim(),
                  kind,
                  priority,
                  startsAt: startsAt ? startsAt.toISOString() : null,
                  dueAt: dueAt ? dueAt.toISOString() : null,
                  estimateHours: typeof estimateHours === 'number' ? estimateHours : null,
                  tagIds,
                })
              }
              disabled={!projectId || !title.trim() || !description.trim() || Boolean(invalidRange) || loading}
              loading={loading}
            >
              Create
            </Button>
          ) : (
            <Button
              leftSection={<TbFileImport size={14} />}
              onClick={submitBulk}
              disabled={
                !projectId || !parsed || parsed.rows.length === 0 || totalErrors > 0 || loading
              }
              loading={loading}
            >
              Import {parsed && totalErrors === 0 ? `${parsed.rows.length} task` : ''}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}

const GANTT_STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#868e96',
  IN_PROGRESS: '#7950f2',
  READY_FOR_QC: '#f59f00',
  REOPENED: '#fd7e14',
  CLOSED: '#40c057',
}

const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'OPEN', label: 'Open' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'READY_FOR_QC', label: 'Ready for QC' },
  { status: 'REOPENED', label: 'Reopened' },
  { status: 'CLOSED', label: 'Closed' },
]

function kanbanAllowed(current: TaskStatus, kind: TaskKind): TaskStatus[] {
  if (kind === 'TASK') {
    const m: Record<TaskStatus, TaskStatus[]> = {
      OPEN: ['IN_PROGRESS', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'CLOSED'],
      CLOSED: ['REOPENED'],
      REOPENED: ['IN_PROGRESS', 'CLOSED'],
      READY_FOR_QC: ['CLOSED', 'REOPENED'],
    }
    return m[current] ?? []
  }
  const m: Record<TaskStatus, TaskStatus[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  }
  return m[current] ?? []
}

const KANBAN_PAGE = 20

function TasksKanbanView({
  tasks,
  canWrite,
  onSelect,
}: {
  tasks: TaskListItem[]
  canWrite: boolean
  onSelect: (id: string) => void
}) {
  const qc = useQueryClient()
  // cols: per-kolom array, persis apa yang di-render.
  // Di-init dan di-sync dari tasks prop (server data sudah terurut by kanbanOrder).
  // Tidak perlu optimistic state — setelah drop kita langsung update DB,
  // lalu refetch mengembalikan urutan yang sudah tersimpan.
  const buildCols = (src: TaskListItem[]): Record<TaskStatus, TaskListItem[]> => {
    const m: Record<TaskStatus, TaskListItem[]> = {
      OPEN: [], IN_PROGRESS: [], READY_FOR_QC: [], REOPENED: [], CLOSED: [],
    }
    for (const t of src) m[t.status].push(t)
    return m
  }
  const [cols, setCols] = useState<Record<TaskStatus, TaskListItem[]>>(() => buildCols(tasks))

  // Sync cols from server whenever tasks prop changes (after refetch)
  const prevTasksRef = useRef(tasks)
  useEffect(() => {
    if (prevTasksRef.current === tasks) return
    prevTasksRef.current = tasks
    setCols(buildCols(tasks))
  }, [tasks])

  // Per-column show-more limit
  const [colLimit, setColLimit] = useState<Record<TaskStatus, number>>({
    OPEN: KANBAN_PAGE, IN_PROGRESS: KANBAN_PAGE, READY_FOR_QC: KANBAN_PAGE,
    REOPENED: KANBAN_PAGE, CLOSED: KANBAN_PAGE,
  })

  const [colHidden, setColHidden] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-hidden', defaultValue: {},
  })
  const [colMax, setColMax] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-max', defaultValue: {},
  })

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const draggingTask = draggingTaskId
    ? Object.values(cols).flat().find((t) => t.id === draggingTaskId)
    : null
  const allowedTargets = draggingTask ? kanbanAllowed(draggingTask.status, draggingTask.kind) : []

  const toggleHidden = (s: TaskStatus) => setColHidden((p) => ({ ...p, [s]: !p[s] }))
  const toggleMax    = (s: TaskStatus) => setColMax((p) => ({ ...p, [s]: !p[s] }))

  const handleDragEnd = useCallback((result: import('@hello-pangea/dnd').DropResult) => {
    setDraggingTaskId(null)
    const { source, destination, draggableId, reason } = result

    if (reason === 'CANCEL' || !destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const srcStatus = source.droppableId as TaskStatus
    const dstStatus = destination.droppableId as TaskStatus

    // 1. Update cols state optimistically (immediate visual feedback)
    let newCols: Record<TaskStatus, TaskListItem[]> | null = null
    setCols((prev) => {
      const next: Record<TaskStatus, TaskListItem[]> = {
        OPEN: [...prev.OPEN],
        IN_PROGRESS: [...prev.IN_PROGRESS],
        READY_FOR_QC: [...prev.READY_FOR_QC],
        REOPENED: [...prev.REOPENED],
        CLOSED: [...prev.CLOSED],
      }
      const [moved] = next[srcStatus].splice(source.index, 1)
      if (!moved) return prev

      if (srcStatus !== dstStatus) {
        const allowed = kanbanAllowed(srcStatus, moved.kind)
        if (!allowed.includes(dstStatus)) {
          next[srcStatus].splice(source.index, 0, moved)
          return prev
        }
        next[dstStatus].splice(destination.index, 0, { ...moved, status: dstStatus })
      } else {
        next[dstStatus].splice(destination.index, 0, moved)
      }

      newCols = next
      return next
    })

    // 2. Persist new order to server — assign kanbanOrder = array index
    setTimeout(() => {
      if (!newCols) return
      const updates: Array<{ id: string; kanbanOrder: number; status?: string }> = []

      // Collect all tasks from affected columns with their new index as kanbanOrder
      const affectedStatuses = srcStatus === dstStatus ? [srcStatus] : [srcStatus, dstStatus]
      for (const status of affectedStatuses) {
        newCols[status].forEach((t, idx) => {
          updates.push({
            id: t.id,
            kanbanOrder: idx,
            ...(t.id === draggableId && srcStatus !== dstStatus ? { status: dstStatus } : {}),
          })
        })
      }

      api('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ['tasks'] }))
        .catch(() => qc.invalidateQueries({ queryKey: ['tasks'] }))
    }, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, cols])

  const gridCols = KANBAN_COLUMNS.map((col) =>
    colHidden[col.status] ? '44px' : colMax[col.status] ? 'minmax(360px, 2fr)' : 'minmax(240px, 1fr)'
  ).join(' ')

  return (
    <DragDropContext
      onDragStart={(initial) => setDraggingTaskId(initial.draggableId)}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, overflowX: 'auto' }}>
        {KANBAN_COLUMNS.map((col) => {
          const items = cols[col.status]
          const limit = colLimit[col.status]
          const visible = items.slice(0, limit)
          const hiddenCount = items.length - visible.length
          const isHidden = !!colHidden[col.status]
          const isMax = !!colMax[col.status]
          // A column is a valid drop target if the task can transition to it
          const isDropDisabled = !canWrite || isHidden ||
            (draggingTask !== null && draggingTask !== undefined &&
              draggingTask.status !== col.status &&
              !allowedTargets.includes(col.status))

          return (
            <Card
              key={col.status}
              withBorder
              padding="xs"
              radius="md"
              style={{ minHeight: isHidden ? 0 : 240, overflow: 'visible' }}
            >
              {/* Column header — minimized: vertical stack */}
              {isHidden ? (
                <Stack align="center" gap={4}>
                  <Text size="xs" fw={700} c="dimmed">{items.length}</Text>
                  <Tooltip label={`Tampilkan ${col.label}`} position="right">
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => toggleHidden(col.status)}>
                      <TbChevronRight size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Stack>
              ) : (
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Group gap={6} style={{ minWidth: 0, overflow: 'hidden' }}>
                    <Badge size="sm" color={STATUS_COLOR[col.status]} variant="light" style={{ flexShrink: 0 }}>
                      {col.label}
                    </Badge>
                    <Text size="xs" c="dimmed">{items.length}</Text>
                  </Group>
                  <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Tooltip label={isMax ? 'Perkecil kolom' : 'Perbesar kolom'}>
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => toggleMax(col.status)}>
                        {isMax ? <TbArrowsMinimize size={12} /> : <TbArrowsMaximize size={12} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Ciutkan kolom">
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => toggleHidden(col.status)}>
                        <TbChevronLeft size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              )}

              {/* Cards */}
              {!isHidden && (
                <Droppable droppableId={col.status} isDropDisabled={isDropDisabled}>
                  {(provided, snapshot) => (
                    <Stack
                      gap={6}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        minHeight: 40,
                        background: snapshot.isDraggingOver && !isDropDisabled
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                        borderRadius: 'var(--mantine-radius-md)',
                        transition: 'background 120ms ease',
                        padding: snapshot.isDraggingOver ? '4px' : undefined,
                      }}
                    >
                      {visible.length === 0 && !snapshot.isDraggingOver && (
                        <Text size="xs" c="dimmed" ta="center" py="md">No tasks</Text>
                      )}

                      {visible.map((t, idx) => (
                        <Draggable
                          key={t.id}
                          draggableId={t.id}
                          index={idx}
                          isDragDisabled={!canWrite}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <Card
                              withBorder
                              padding="xs"
                              radius="sm"
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => !dragSnapshot.isDragging && onSelect(t.id)}
                              style={{
                                cursor: canWrite ? 'grab' : 'pointer',
                                opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                boxShadow: dragSnapshot.isDragging
                                  ? '0 8px 24px rgba(0,0,0,0.18)'
                                  : undefined,
                                ...dragProvided.draggableProps.style,
                              }}
                            >
                              <Stack gap={4}>
                                <Group gap={4} wrap="wrap">
                                  <Badge size="xs" color={KIND_COLOR[t.kind]} variant="light">{t.kind}</Badge>
                                  <Badge size="xs" color={PRIORITY_COLOR[t.priority]} variant="dot">{t.priority}</Badge>
                                </Group>
                                <Text size="sm" fw={500} lineClamp={2}>{t.title}</Text>
                                {t.tags.length > 0 && (
                                  <Group gap={4} wrap="wrap">
                                    {t.tags.slice(0, 3).map((tg) => (
                                      <Badge key={tg.tagId} size="xs" variant="light" color={tg.tag.color}>{tg.tag.name}</Badge>
                                    ))}
                                  </Group>
                                )}
                                {t.progressPercent != null && t.progressPercent > 0 && (
                                  <div style={{ height: 4, background: 'var(--mantine-color-gray-2)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${t.progressPercent}%`, height: '100%',
                                      background: t.status === 'CLOSED' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)',
                                    }} />
                                  </div>
                                )}
                                <Group justify="space-between" wrap="nowrap">
                                  <Text size="xs" c="dimmed" truncate>{t.assignee ? t.assignee.name : 'Unassigned'}</Text>
                                  {t.dueAt && (
                                    <Text size="xs" c={new Date(t.dueAt) < new Date() && t.status !== 'CLOSED' ? 'red' : 'dimmed'}>
                                      {new Date(t.dueAt).toLocaleDateString()}
                                    </Text>
                                  )}
                                </Group>
                              </Stack>
                            </Card>
                          )}
                        </Draggable>
                      ))}

                      {/* Required by @hello-pangea/dnd — reserves space for dragged item */}
                      {provided.placeholder}

                      {hiddenCount > 0 && (
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          color="gray"
                          fullWidth
                          onClick={() => setColLimit((prev) => ({ ...prev, [col.status]: prev[col.status] + KANBAN_PAGE }))}
                        >
                          +{hiddenCount} lainnya
                        </Button>
                      )}
                    </Stack>
                  )}
                </Droppable>
              )}
            </Card>
          )
        })}
      </div>
    </DragDropContext>
  )
}

function TasksGanttView({ tasks, onSelect }: { tasks: TaskListItem[]; onSelect: (id: string) => void }) {
  const withDates = useMemo(() => tasks.filter((t) => (t.startsAt || t.createdAt) && t.dueAt), [tasks])

  const option = useMemo<EChartsOption>(() => {
    const now = Date.now()
    const categories = withDates.map((t) => t.title)
    const data = withDates.map((t, idx) => {
      const start = new Date(t.startsAt ?? t.createdAt).getTime()
      const end = new Date(t.dueAt as string).getTime()
      const overdue = end < now && t.status !== 'CLOSED'
      const color = overdue ? '#fa5252' : GANTT_STATUS_HEX[t.status]
      return {
        name: t.title,
        value: [idx, start, end],
        taskId: t.id,
        status: t.status,
        assignee: t.assignee?.name ?? 'Unassigned',
        progressPercent: t.progressPercent,
        overdue,
        itemStyle: { color },
      }
    })

    type BarData = (typeof data)[number]

    return {
      grid: { left: 200, right: 24, top: 12, bottom: 48, containLabel: false },
      xAxis: { type: 'time', position: 'bottom', splitLine: { show: true } },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLabel: { width: 180, overflow: 'truncate', fontSize: 11 },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { data: BarData }
          const d = p.data
          const start = new Date(d.value[1]).toLocaleDateString()
          const end = new Date(d.value[2]).toLocaleDateString()
          const parts = [
            `<b>${d.name}</b>`,
            `${start} → ${end}`,
            `Status: ${d.status.replace('_', ' ')} · Assignee: ${d.assignee}`,
          ]
          if (d.progressPercent != null) parts.push(`Progress: ${d.progressPercent}%`)
          if (d.overdue) parts.push('<span style="color:#fa5252">Overdue</span>')
          return parts.join('<br/>')
        },
      },
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2], y: 0 },
          data,
          renderItem: (_params: unknown, apiRef: unknown) => {
            const api = apiRef as {
              value: (i: number) => number
              coord: (pt: [number, number]) => [number, number]
              size: (v: [number, number]) => [number, number]
              visual: (key: string) => string
            }
            const yIdx = api.value(0)
            const start = api.coord([api.value(1), yIdx])
            const end = api.coord([api.value(2), yIdx])
            const height = api.size([0, 1])[1] * 0.5
            const width = Math.max(2, end[0] - start[0])
            const color = api.visual('color') || '#228be6'
            return {
              type: 'rect',
              shape: { x: start[0], y: start[1] - height / 2, width, height },
              style: { fill: color, opacity: 0.9 },
            }
          },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { formatter: 'Today', position: 'insideEndTop', color: '#fa5252' },
            lineStyle: { color: '#fa5252', type: 'dashed', width: 1 },
            data: [{ xAxis: now }],
          },
        },
      ],
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, height: 18, bottom: 8, filterMode: 'weakFilter' },
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
      ],
    } as unknown as EChartsOption
  }, [withDates])

  if (withDates.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <TbListCheck size={32} />
          <Text fw={500}>No tasks with due date</Text>
          <Text size="sm" c="dimmed">
            Set a due date (and optionally a start date) on a task to see it here.
          </Text>
        </Stack>
      </Card>
    )
  }

  const height = Math.max(240, withDates.length * 32 + 80)

  return (
    <Card withBorder padding="sm" radius="md">
      <EChart
        option={option}
        height={height}
        onEvents={{
          click: (params: unknown) => {
            const p = params as { data?: { taskId?: string } }
            const id = p?.data?.taskId
            if (id) onSelect(id)
          },
        }}
      />
    </Card>
  )
}
