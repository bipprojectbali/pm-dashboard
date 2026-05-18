import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Pagination,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbChartBar,
  TbChevronRight,
  TbClock,
  TbDownload,
  TbFilter,
  TbListCheck,
  TbPlus,
  TbRefresh,
  TbSearch,
  TbTag,
  TbTrash,
  TbUserQuestion,
  TbX,
} from 'react-icons/tb'
import { DatePickerInput } from '@mantine/dates'
import { useLocalStorage } from '@mantine/hooks'
import { useSession } from '../hooks/useAuth'
import { notifyError, notifySuccess } from '../lib/notify'
import { downloadTasksCsv, type ExportTaskRow } from '../lib/csv'
import { CreateTaskModal } from './CreateTaskModal'
import { TaskDashboardOverlay } from './TaskDashboardOverlay'
import { TaskDetailView } from './TaskDetailView'
import { TasksGanttView } from './TasksGanttView'
import { TasksKanbanView } from './TasksKanbanView'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskKind = 'TASK' | 'BUG' | 'QC'

interface TaskUser {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
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
  blockedBy: { blockedById: string }[]
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

  const session = useSession()
  const systemRole = session.data?.user?.role ?? null
  const isAdmin = systemRole === 'ADMIN' || systemRole === 'SUPER_ADMIN'
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const openTask = (id: string) => setDrawerTaskId(id)
  const closeTask = () => {
    setDrawerTaskId(null)
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const [showCharts, setShowCharts] = useLocalStorage({ key: 'pm:tasks:show-charts', defaultValue: true })
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [view, setView] = useLocalStorage<'table' | 'gantt' | 'kanban'>({ key: 'pm:tasks:view', defaultValue: 'table' })
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'overdue' | 'unassigned' | 'openOnly' | null>(null)
  const [dueDateRange, setDueDateRange] = useState<[Date | null, Date | null]>([null, null])
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
  if (view === 'kanban') params.set('limit', '500')
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
      const [dueFrom, dueTo] = dueDateRange
      if (dueFrom || dueTo) {
        if (!t.dueAt) return false
        const due = new Date(t.dueAt).getTime()
        if (dueFrom && due < new Date(dueFrom).getTime()) return false
        if (dueTo) {
          const endOfDay = new Date(dueTo)
          endOfDay.setHours(23, 59, 59, 999)
          if (due > endOfDay.getTime()) return false
        }
      }
      return true
    })
  }, [rawTasks, search, quickFilter, dueDateRange])
  const activeProject = activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null

  const handleExport = () => {
    const rows: ExportTaskRow[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      kind: t.kind,
      status: t.status,
      priority: t.priority,
      startsAt: t.startsAt,
      dueAt: t.dueAt,
      estimateHours: t.estimateHours,
      actualHours: t.actualHours,
      progressPercent: t.progressPercent,
      assigneeEmail: t.assignee?.email ?? null,
      assigneeName: t.assignee?.name ?? null,
      reporterEmail: t.reporter.email,
      projectName: t.project.name,
      tags: t.tags.map((tg) => tg.tag.name),
      createdAt: t.createdAt,
      closedAt: t.closedAt,
    }))
    const projectSlug = activeProject?.name.replace(/\s+/g, '-').toLowerCase() ?? 'all'
    const statusSlug = status ?? 'all'
    const date = new Date().toLocaleDateString('id-ID').replace(/\//g, '-')
    downloadTasksCsv(rows, `tasks-${projectSlug}-${statusSlug}-${date}.csv`)
  }
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
  }, [activeProjectId, status, kind, mine, tagFilter, search, quickFilter, dueDateRange])

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

          {/* ─── Scope ─── */}
          <Divider label={<Group gap={4}><TbFilter size={11} /><Text size="xs" c="dimmed" fw={600}>Scope</Text></Group>} labelPosition="left" />
          <Group gap="sm" wrap="wrap" align="center">
            {activeProject ? (
              <Badge
                color="blue"
                variant="light"
                size="lg"
                leftSection={<TbTag size={12} />}
                rightSection={
                  <ActionIcon size="xs" variant="transparent" color="blue" onClick={() => changeProject(null)} aria-label="Clear project filter">
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
            <Switch label="Assigned to me" checked={mine} onChange={(e) => setMine(e.currentTarget.checked)} size="sm" />
          </Group>

          {/* ─── Tipe Task ─── */}
          <Divider label={<Text size="xs" c="dimmed" fw={600}>Tipe Task</Text>} labelPosition="left" />
          <Group gap="sm" wrap="wrap" align="center">
            <Select
              placeholder="All kinds"
              data={['TASK', 'BUG', 'QC']}
              value={kind}
              onChange={setKind}
              clearable
              size="xs"
              w={130}
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
                w={155}
              />
            ) : null}
          </Group>

          {/* ─── Tanggal ─── */}
          <Divider label={<Text size="xs" c="dimmed" fw={600}>Tanggal Due</Text>} labelPosition="left" />
          <Group gap="sm" wrap="wrap" align="center">
            <DatePickerInput
              type="range"
              placeholder="Semua due date"
              value={dueDateRange}
              onChange={(v) => setDueDateRange(v as [Date | null, Date | null])}
              clearable
              size="xs"
              w={260}
              valueFormat="DD MMM YYYY"
              getDayProps={(raw) => {
                const date = new Date(raw)
                const t = new Date()
                const isToday = date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear()
                if (!isToday) return {}
                return {
                  style: {
                    backgroundColor: 'var(--mantine-color-orange-6)',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: 4,
                  },
                }
              }}
            />
          </Group>

          {/* ─── Cari & Tampilan ─── */}
          <Divider />
          <Group gap="sm" wrap="wrap" align="center">
            <TextInput
              placeholder="Cari judul atau deskripsi"
              leftSection={<TbSearch size={12} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              size="xs"
              w={230}
            />
            <Text size="xs" c="dimmed" fw={500}>Quick</Text>
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
            <Text size="xs" c="dimmed" fw={500}>Attention</Text>
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
            {(quickFilter || search || dueDateRange[0] || dueDateRange[1]) && (
              <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                onClick={() => { setQuickFilter(null); setSearch(''); setDueDateRange([null, null]) }}
              >
                Clear
              </Button>
            )}
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
            <Tooltip label={`Download CSV (${tasks.length} task${status ? ` · ${status}` : ' · semua status'})`} withArrow>
              <ActionIcon variant="light" color="teal" size="sm" onClick={handleExport} disabled={tasks.length === 0}>
                <TbDownload size={14} />
              </ActionIcon>
            </Tooltip>
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
          totalFetched={rawTasks.length}
          filterKey={query}
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
                      {t.assignee ? (
                        <Tooltip label={t.assignee.name} withArrow>
                          <Group gap={6} wrap="nowrap">
                            <UserAvatar name={t.assignee.name} image={t.assignee.image} size={20} color="blue" />
                            <Text size="xs" truncate style={{ maxWidth: 90 }}>{t.assignee.name.split(' ')[0]}</Text>
                          </Group>
                        </Tooltip>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {t.dueAt ? (
                        (() => {
                          const dueMs = new Date(t.dueAt).getTime()
                          const overdue = t.status !== 'CLOSED' && dueMs < Date.now()
                          return (
                            <Text size="xs" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                              {new Date(t.dueAt).toLocaleDateString('id-ID')}
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

      <Modal
        opened={!!drawerTaskId}
        onClose={closeTask}
        centered
        size="min(90vw, 1100px)"
        withCloseButton={false}
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ blur: 4, backgroundOpacity: 0.45 }}
        transitionProps={{ transition: 'fade-up', duration: 220 }}
        radius="lg"
        styles={{
          content: { maxHeight: '90vh' },
          body: { padding: 'var(--mantine-spacing-lg)' },
        }}
      >
        {drawerTaskId && (
          <TaskDetailView taskId={drawerTaskId} onBack={closeTask} />
        )}
      </Modal>
    </Stack>
  )
}

