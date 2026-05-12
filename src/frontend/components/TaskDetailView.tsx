import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  CopyButton,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useHotkeys } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  TbActivity,
  TbAlertTriangle,
  TbApps,
  TbArrowLeft,
  TbBug,
  TbCalendarEvent,
  TbCheck,
  TbChecks,
  TbClock,
  TbCloudUpload,
  TbCopy,
  TbDeviceDesktop,
  TbEdit,
  TbLink,
  TbListCheck,
  TbLock,
  TbMessage,
  TbPaperclip,
  TbPlus,
  TbRefresh,
  TbShieldCheck,
  TbTag,
  TbTarget,
  TbTrash,
  TbUpload,
  TbX,
} from 'react-icons/tb'
import { modals } from '@mantine/modals'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '../lib/notify'
import { Breadcrumbs } from './shared/Breadcrumbs'
import { UserAvatar } from './shared/UserAvatar'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskKind = 'TASK' | 'BUG' | 'QC'
type ProjectMemberRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'

interface TaskUser {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
}

interface TaskComment {
  id: string
  body: string
  authorTag: string
  createdAt: string
  author: TaskUser
}

interface TaskEvidence {
  id: string
  kind: string
  url: string
  note: string | null
  createdAt: string
}

interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

interface DependencyTask {
  id: string
  title: string
  status: TaskStatus
  kind: TaskKind
}

interface ChecklistItem {
  id: string
  title: string
  done: boolean
  order: number
}

interface StatusChange {
  id: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
  createdAt: string
  author: { id: string; name: string; email: string } | null
}

interface TagListItem {
  id: string
  projectId: string
  name: string
  color: string
}

interface AwFocus {
  focusHours: number
  eventCount: number
  windowStart: string
  windowEnd: string
  topApps: Array<{ app: string; seconds: number }>
  topTitles: Array<{ app: string; title: string; seconds: number }>
  matchKeywords: string[]
  matchedHours: number | null
}

interface TaskDetail {
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
  comments: TaskComment[]
  evidence: TaskEvidence[]
  tags: TaskTag[]
  blockedBy: Array<{ id: string; blockedById: string; blockedBy: DependencyTask }>
  blocks: Array<{ id: string; taskId: string; task: DependencyTask }>
  checklist: ChecklistItem[]
  statusChanges: StatusChange[]
  awFocus: AwFocus | null
}

interface ProjectDetail {
  id: string
  name: string
  members: Array<{
    userId: string
    role: ProjectMemberRole
    user: TaskUser
  }>
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

function allowedTransitions(current: TaskStatus, kind: TaskKind): TaskStatus[] {
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function TaskDetailView({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const qc = useQueryClient()

  const taskQ = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<{ task: TaskDetail }>(`/api/tasks/${taskId}`),
  })
  const task = taskQ.data?.task

  const projectQ = useQuery({
    queryKey: ['project', task?.projectId],
    queryFn: () =>
      api<{ project: ProjectDetail; myRole: ProjectMemberRole | null }>(`/api/projects/${task?.projectId}`),
    enabled: !!task?.projectId,
  })
  const myRole = projectQ.data?.myRole ?? null
  const canWrite = myRole !== null && myRole !== 'VIEWER'
  const session = useSession()
  const sessionRole = session.data?.user?.role
  const canDelete = sessionRole === 'SUPER_ADMIN' || myRole === 'OWNER' || myRole === 'PM'

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')

  useEffect(() => {
    if (!editingTitle && task) setDraftTitle(task.title)
  }, [editingTitle, task])
  useEffect(() => {
    if (!editingDescription && task) setDraftDescription(task.description ?? '')
  }, [editingDescription, task])

  const update = useMutation({
    mutationFn: (
      body: Partial<Pick<TaskDetail, 'status' | 'priority'>> & {
        title?: string
        description?: string
        route?: string | null
        assigneeId?: string | null
        startsAt?: string | null
        dueAt?: string | null
        estimateHours?: number | null
        progressPercent?: number | null
        tagIds?: string[]
      },
    ) =>
      api<{ task: TaskDetail }>(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Task diperbarui.' })
      if ('title' in variables) setEditingTitle(false)
      if ('description' in variables) setEditingDescription(false)
    },
    onError: (err) => notifyError(err),
  })

  const deleteM = useMutation({
    mutationFn: () => api<{ ok: true }>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Task dihapus.' })
      onBack()
    },
    onError: (err) => notifyError(err),
  })

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Hapus task?',
      children: (
        <Text size="sm">
          Task beserta comments, evidence, checklist, dependencies, dan timeline status-nya akan dihapus permanen. Aksi
          ini tidak dapat dibatalkan.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteM.mutate(),
    })

  const saveTitle = () => {
    if (!task) return
    const title = draftTitle.trim()
    if (!title) {
      notifyError({ message: 'Title wajib diisi.' })
      return
    }
    if (title.length > 500) {
      notifyError({ message: 'Title maksimum 500 karakter.' })
      return
    }
    if (title === task.title) {
      setEditingTitle(false)
      return
    }
    update.mutate({ title })
  }

  const saveDescription = () => {
    if (!task) return
    const description = draftDescription
    if (description === (task.description ?? '')) {
      setEditingDescription(false)
      return
    }
    update.mutate({ description })
  }

  const tagsQ = useQuery({
    queryKey: ['tags', task?.projectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${task?.projectId}/tags`),
    enabled: !!task?.projectId,
  })

  const projectTasksQ = useQuery({
    queryKey: ['tasks', `projectId=${task?.projectId}`],
    queryFn: () =>
      api<{ tasks: Array<{ id: string; title: string; status: TaskStatus }> }>(
        `/api/tasks?projectId=${task?.projectId}`,
      ),
    enabled: !!task?.projectId,
  })

  const addDependency = useMutation({
    mutationFn: (blockedById: string) =>
      api(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedById }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      notifySuccess({ message: 'Dependency ditambahkan.' })
    },
    onError: (err) => notifyError(err),
  })

  const removeDependency = useMutation({
    mutationFn: (blockedById: string) => api(`/api/tasks/${taskId}/dependencies/${blockedById}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      notifySuccess({ message: 'Dependency dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const addChecklist = useMutation({
    mutationFn: (title: string) =>
      api(`/api/tasks/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => notifyError(err),
  })

  const updateChecklist = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { done?: boolean; title?: string } }) =>
      api(`/api/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => notifyError(err),
  })

  const removeChecklist = useMutation({
    mutationFn: (id: string) => api(`/api/checklist/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => notifyError(err),
  })

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api<{ tag: TagListItem }>(`/api/projects/${task?.projectId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tags', task?.projectId] })
      notifySuccess({ message: `Tag "${res.tag.name}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const addComment = useMutation({
    mutationFn: (body: string) =>
      api<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      notifySuccess({ message: 'Komentar dikirim.' })
    },
    onError: (err) => notifyError(err),
  })

  const addEvidence = useMutation({
    mutationFn: (body: { kind: string; url: string; note?: string }) =>
      api<{ evidence: TaskEvidence }>(`/api/tasks/${taskId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      notifySuccess({ message: 'Evidence ditambahkan.' })
    },
    onError: (err) => notifyError(err),
  })

  useHotkeys([['Escape', onBack]])

  const isOverdue = task?.dueAt && task.status !== 'CLOSED' && new Date(task.dueAt) < new Date()

  return (
    <Stack gap={0}>
      {/* ── Top bar ── */}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Tooltip label="Kembali (Esc)">
            <ActionIcon variant="subtle" size="md" onClick={onBack}>
              <TbArrowLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <Breadcrumbs
            items={[
              { label: 'Tasks', onClick: onBack },
              ...(task ? [{ label: task.project.name }] : []),
              { label: task?.title ?? `#${taskId.slice(0, 8)}` },
            ]}
          />
          {task && (
            <CopyButton value={task.id} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Disalin!' : 'Salin ID'}>
                  <ActionIcon variant="subtle" size="sm" color={copied ? 'teal' : 'gray'} onClick={copy}>
                    {copied ? <TbChecks size={13} /> : <TbCopy size={13} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
        </Group>
        <Group gap={6}>
          {taskQ.isFetching && !taskQ.isLoading && (
            <Badge variant="dot" color="blue" size="xs">Sync…</Badge>
          )}
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" size="md" onClick={() => taskQ.refetch()} loading={taskQ.isFetching}>
              <TbRefresh size={15} />
            </ActionIcon>
          </Tooltip>
          {task && canDelete && (
            <Tooltip label="Hapus task">
              <ActionIcon variant="subtle" color="red" size="md" onClick={confirmDelete} loading={deleteM.isPending}>
                <TbTrash size={15} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {/* ── States ── */}
      {taskQ.isLoading ? (
        <Stack gap="md" p="md">
          <Group gap="sm" align="flex-start">
            <Skeleton height={44} width={44} radius="md" />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton height={22} width="55%" />
              <Skeleton height={13} width="40%" />
              <Group gap={6}><Skeleton height={18} width={52} radius="xl" /><Skeleton height={18} width={68} radius="xl" /></Group>
            </Stack>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {[80, 80, 120, 120].map((h, i) => <Skeleton key={i} height={h} radius="md" />)}
          </SimpleGrid>
        </Stack>
      ) : taskQ.error ? (
        <Alert color="red" icon={<TbAlertTriangle size={16} />} title="Gagal memuat" m="md" radius="md">
          <Stack gap="xs">
            <Text size="sm">{(taskQ.error as Error).message}</Text>
            <Group gap="xs">
              <Button size="xs" variant="light" color="red" leftSection={<TbRefresh size={13} />} onClick={() => taskQ.refetch()}>Coba lagi</Button>
              <Button size="xs" variant="subtle" onClick={onBack}>Kembali</Button>
            </Group>
          </Stack>
        </Alert>
      ) : !task ? (
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} m="md" radius="md">
          Task tidak ditemukan atau kamu tidak punya akses.
        </Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} style={{ minHeight: 0 }}>

          {/* ── Left: main content ── */}
          <Stack
            gap="md"
            p="md"
            style={{ borderRight: '1px solid var(--mantine-color-default-border)', minWidth: 0 }}
          >
            {/* Title + kind icon */}
            <Group gap="sm" align="flex-start" wrap="nowrap">
              <ThemeIcon variant="light" color={KIND_COLOR[task.kind]} size={40} radius="md" style={{ flexShrink: 0, marginTop: 2 }}>
                {task.kind === 'BUG' ? <TbBug size={20} /> : task.kind === 'QC' ? <TbShieldCheck size={20} /> : <TbListCheck size={20} />}
              </ThemeIcon>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                {editingTitle ? (
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <TextInput
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                        else if (e.key === 'Escape') setEditingTitle(false)
                      }}
                      size="sm"
                      maxLength={500}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <ActionIcon variant="light" color="blue" size="sm" onClick={saveTitle} loading={update.isPending}><TbCheck size={14} /></ActionIcon>
                    <ActionIcon variant="subtle" size="sm" onClick={() => setEditingTitle(false)} disabled={update.isPending}><TbX size={14} /></ActionIcon>
                  </Group>
                ) : (
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <Text fw={700} size="lg" style={{ lineHeight: 1.3, flex: 1, wordBreak: 'break-word' }}>
                      {task.title}
                    </Text>
                    {canWrite && (
                      <Tooltip label="Edit judul">
                        <ActionIcon variant="subtle" size="xs" color="gray" onClick={() => setEditingTitle(true)} style={{ marginTop: 3, flexShrink: 0 }}>
                          <TbEdit size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                )}
                <Group gap={4} wrap="wrap">
                  <Badge color={KIND_COLOR[task.kind]} variant="light" size="xs">{task.kind}</Badge>
                  <Badge color={STATUS_COLOR[task.status]} variant="filled" size="xs">{task.status.replace(/_/g, ' ')}</Badge>
                  <Badge color={PRIORITY_COLOR[task.priority]} variant="light" size="xs"
                    leftSection={<div style={{ width: 5, height: 5, borderRadius: '50%', background: `var(--mantine-color-${PRIORITY_COLOR[task.priority]}-6)` }} />}
                  >{task.priority}</Badge>
                  {isOverdue && <Badge color="red" variant="filled" size="xs" leftSection={<TbAlertTriangle size={9} />}>Overdue</Badge>}
                  {task.blockedBy.length > 0 && task.status !== 'CLOSED' && (
                    <Badge color="orange" variant="light" size="xs" leftSection={<TbLock size={9} />}>Blocked</Badge>
                  )}
                  {task.route && <Badge color="gray" variant="light" size="xs" leftSection={<TbLink size={9} />}>{task.route}</Badge>}
                  {task.tags.map((t) => (
                    <Badge key={t.tagId} color={t.tag.color} variant="dot" size="xs">{t.tag.name}</Badge>
                  ))}
                </Group>
                <Text size="xs" c="dimmed">
                  #{task.id.slice(0, 8)} · {task.project.name} · {task.reporter.name} · {new Date(task.createdAt).toLocaleDateString('id-ID')}
                </Text>
              </Stack>
            </Group>

            <Divider />

            {/* Description */}
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Deskripsi</Text>
                {canWrite && !editingDescription && (
                  <ActionIcon variant="subtle" size="xs" color="gray" onClick={() => setEditingDescription(true)}>
                    <TbEdit size={12} />
                  </ActionIcon>
                )}
              </Group>
              {editingDescription ? (
                <Stack gap="xs">
                  <Textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.currentTarget.value)}
                    autosize minRows={3}
                    placeholder="Deskripsi, steps to reproduce, expected vs actual…"
                    autoFocus
                  />
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" leftSection={<TbX size={12} />} onClick={() => setEditingDescription(false)} disabled={update.isPending}>Batal</Button>
                    <Button size="xs" leftSection={<TbCheck size={12} />} onClick={saveDescription} loading={update.isPending}>Simpan</Button>
                  </Group>
                </Stack>
              ) : (
                <Text size="sm" c={task.description ? undefined : 'dimmed'} fs={task.description ? undefined : 'italic'} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {task.description || 'Belum ada deskripsi'}
                </Text>
              )}
            </Stack>

            {/* Tabs */}
            <Card withBorder radius="md" padding={0} style={{ overflow: 'hidden' }}>
              <Tabs defaultValue="checklist" keepMounted={false}
                styles={{
                  list: { paddingInline: 8, paddingTop: 4, background: 'var(--mantine-color-default-hover)' },
                  tab: { fontWeight: 500, fontSize: 'var(--mantine-font-size-xs)' },
                }}
              >
                <Tabs.List>
                  <Tabs.Tab value="checklist" leftSection={<TbListCheck size={13} />}
                    rightSection={task.checklist.length ? <TabCount value={`${task.checklist.filter(c=>c.done).length}/${task.checklist.length}`} color={task.checklist.every(c=>c.done)&&task.checklist.length>0?'green':'gray'} /> : undefined}
                  >Checklist</Tabs.Tab>
                  <Tabs.Tab value="comments" leftSection={<TbMessage size={13} />}
                    rightSection={task.comments.length ? <TabCount value={task.comments.length} /> : undefined}
                  >Komentar</Tabs.Tab>
                  <Tabs.Tab value="evidence" leftSection={<TbPaperclip size={13} />}
                    rightSection={task.evidence.length ? <TabCount value={task.evidence.length} /> : undefined}
                  >Evidence</Tabs.Tab>
                  <Tabs.Tab value="dependencies" leftSection={<TbLock size={13} />}
                    rightSection={task.blockedBy.length+task.blocks.length>0 ? <TabCount value={`${task.blockedBy.length}/${task.blocks.length}`} color={task.blockedBy.length>0?'orange':'gray'} /> : undefined}
                  >Deps</Tabs.Tab>
                  <Tabs.Tab value="activity" leftSection={<TbActivity size={13} />}>Aktivitas</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="checklist" p="sm">
                  <ChecklistSection items={task.checklist} canWrite={canWrite}
                    onToggle={(id,done)=>updateChecklist.mutate({id,body:{done}})}
                    onAdd={(title)=>addChecklist.mutate(title)}
                    onRemove={(id)=>removeChecklist.mutate(id)}
                    adding={addChecklist.isPending}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="comments" p="sm">
                  <CommentsSection comments={task.comments} canWrite={canWrite}
                    onSubmit={(body)=>addComment.mutate(body)}
                    loading={addComment.isPending}
                    error={addComment.error?(addComment.error as Error).message:undefined}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="evidence" p="sm">
                  <EvidenceSection taskId={task.id} items={task.evidence} canWrite={canWrite}
                    onSubmit={(body)=>addEvidence.mutate(body)}
                    loading={addEvidence.isPending}
                    error={addEvidence.error?(addEvidence.error as Error).message:undefined}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="dependencies" p="sm">
                  <DependenciesSection task={task} projectTasks={projectTasksQ.data?.tasks??[]} canWrite={canWrite}
                    onAdd={(blockedById)=>addDependency.mutate(blockedById)}
                    onRemove={(blockedById)=>removeDependency.mutate(blockedById)}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="activity" p="sm">
                  <ActivityTimelineSection task={task} />
                </Tabs.Panel>
              </Tabs>
            </Card>
          </Stack>

          {/* ── Right: sidebar ── */}
          <Stack gap="md" p="md" style={{ minWidth: 0 }}>

            {/* Status transitions */}
            {canWrite && allowedTransitions(task.status, task.kind).length > 0 && (
              <Stack gap={6}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Ubah Status</Text>
                <Group gap="xs" wrap="wrap">
                  {allowedTransitions(task.status, task.kind).map((s) => (
                    <Button key={s} size="xs" variant="light" color={STATUS_COLOR[s]}
                      onClick={() => update.mutate({ status: s })} loading={update.isPending}
                      leftSection={<div style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--mantine-color-${STATUS_COLOR[s]}-6)` }} />}
                    >
                      {s.replace(/_/g, ' ')}
                    </Button>
                  ))}
                </Group>
                {update.error && <Text size="xs" c="red">{(update.error as Error).message}</Text>}
              </Stack>
            )}

            {/* Assignee + Priority */}
            {canWrite && (
              <Stack gap="sm">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Pengaturan</Text>
                <Select
                  label="Prioritas"
                  size="xs"
                  data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
                  value={task.priority}
                  onChange={(v) => v && update.mutate({ priority: v as TaskPriority })}
                />
                <Select
                  label="Assignee"
                  size="xs"
                  placeholder="Tidak ada"
                  clearable
                  data={projectQ.data?.project.members.map((m) => ({ value: m.user.id, label: `${m.user.name} · ${m.role}` })) ?? []}
                  value={task.assignee?.id ?? null}
                  onChange={(v) => update.mutate({ assigneeId: v })}
                  leftSection={task.assignee ? <UserAvatar name={task.assignee.name} image={task.assignee.image} size={16} color="blue" /> : undefined}
                />
              </Stack>
            )}

            {/* Reporter + Assignee display */}
            <Stack gap={6}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>People</Text>
              <Group gap="xs" wrap="nowrap">
                <UserAvatar name={task.reporter.name} image={task.reporter.image} size={26} color="gray" />
                <Stack gap={0}>
                  <Text size="xs" fw={500}>{task.reporter.name}</Text>
                  <Text size="xs" c="dimmed">Reporter</Text>
                </Stack>
              </Group>
              {task.assignee && (
                <Group gap="xs" wrap="nowrap">
                  <UserAvatar name={task.assignee.name} image={task.assignee.image} size={26} color="blue" />
                  <Stack gap={0}>
                    <Text size="xs" fw={500}>{task.assignee.name}</Text>
                    <Text size="xs" c="dimmed">Assignee</Text>
                  </Stack>
                </Group>
              )}
            </Stack>

            <Divider />

            {/* Dates + Estimate */}
            <Stack gap="sm">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Planning</Text>
              {canWrite ? (
                <Stack gap="xs">
                  <DateInput highlightToday label="Mulai" placeholder="Opsional" size="xs" clearable
                    leftSection={<TbCalendarEvent size={13} />}
                    value={task.startsAt ? new Date(task.startsAt) : null}
                    onChange={(v) => update.mutate({ startsAt: v ? new Date(v as unknown as string).toISOString() : null })}
                  />
                  <DateInput highlightToday label="Tenggat" placeholder="Opsional" size="xs" clearable
                    leftSection={<TbCalendarEvent size={13} />}
                    value={task.dueAt ? new Date(task.dueAt) : null}
                    onChange={(v) => update.mutate({ dueAt: v ? new Date(v as unknown as string).toISOString() : null })}
                  />
                  <EstimateField value={task.estimateHours} onCommit={(v) => update.mutate({ estimateHours: v })} />
                </Stack>
              ) : (
                <Stack gap={4}>
                  {task.startsAt && <Group gap={6}><TbCalendarEvent size={13} /><Text size="xs">{new Date(task.startsAt).toLocaleDateString('id-ID')}</Text><Text size="xs" c="dimmed">mulai</Text></Group>}
                  {task.dueAt && <Group gap={6}><TbCalendarEvent size={13} /><Text size="xs" c={isOverdue ? 'red' : undefined}>{new Date(task.dueAt).toLocaleDateString('id-ID')}</Text><Text size="xs" c="dimmed">tenggat</Text></Group>}
                  {!task.startsAt && !task.dueAt && <Text size="xs" c="dimmed" fs="italic">Belum ada jadwal</Text>}
                </Stack>
              )}
            </Stack>

            {/* Tags */}
            {canWrite && (
              <Stack gap={6}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Tags</Text>
                <TagsPicker
                  projectId={task.projectId}
                  currentTagIds={task.tags.map((t) => t.tagId)}
                  availableTags={tagsQ.data?.tags ?? []}
                  onChange={(tagIds) => update.mutate({ tagIds })}
                  onCreate={(name) => createTag.mutate(name)}
                  creating={createTag.isPending}
                />
              </Stack>
            )}

            <Divider />

            {/* Hours + Progress */}
            <HoursProgressCard task={task} />

            {/* AW Focus */}
            {task.awFocus && <AwFocusCard focus={task.awFocus} task={task} />}
          </Stack>
        </SimpleGrid>
      )}
    </Stack>
  )
}

function TabCount({ value, color = 'gray' }: { value: string | number; color?: string }) {
  return (
    <Badge size="xs" variant="light" color={color} circle>
      {value}
    </Badge>
  )
}

function CommentsSection({
  comments,
  canWrite,
  onSubmit,
  loading,
  error,
}: {
  comments: TaskComment[]
  canWrite: boolean
  onSubmit: (body: string) => void
  loading: boolean
  error?: string
}) {
  const [body, setBody] = useState('')
  const wasLoading = useWasLoading(loading)
  useEffect(() => {
    if (wasLoading && !loading && !error) setBody('')
  }, [wasLoading, loading, error])

  return (
    <Stack gap="sm">
      {comments.length === 0 ? (
        <Text size="sm" c="dimmed">
          No comments yet.
        </Text>
      ) : (
        comments.map((c) => (
          <Card key={c.id} withBorder padding="sm" radius="sm">
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <UserAvatar name={c.author.name} image={c.author.image} size={22} color="blue" />
                <Text size="xs" fw={600}>{c.author.name}</Text>
                <Badge size="xs" variant="light">{c.authorTag}</Badge>
              </Group>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {new Date(c.createdAt).toLocaleString()}
              </Text>
            </Group>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {c.body}
            </Text>
          </Card>
        ))
      )}
      {canWrite ? (
        <>
          <Divider />
          <Textarea
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={10}
          />
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={() => onSubmit(body.trim())}
              disabled={!body.trim() || loading}
              loading={loading}
            >
              Comment
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
}

function EvidenceSection({
  taskId,
  items,
  canWrite,
  onSubmit,
  loading,
  error,
}: {
  taskId: string
  items: TaskEvidence[]
  canWrite: boolean
  onSubmit: (body: { kind: string; url: string; note?: string }) => void
  loading: boolean
  error?: string
}) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<string>('LINK')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const wasLoading = useWasLoading(loading)
  useEffect(() => {
    if (wasLoading && !loading && !error) {
      setUrl('')
      setNote('')
    }
  }, [wasLoading, loading, error])

  const upload = useMutation({
    mutationFn: async ({ file, note: n }: { file: File; note?: string }) => {
      const fd = new FormData()
      fd.append('file', file)
      if (n) fd.append('note', n)
      const res = await fetch(`/api/tasks/${taskId}/evidence/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ evidence: TaskEvidence }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Evidence di-upload.' })
    },
    onError: (err) => notifyError(err),
  })

  return (
    <Stack gap="sm">
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No evidence attached.
        </Text>
      ) : (
        items.map((e) => (
          <Card key={e.id} withBorder padding="sm" radius="sm">
            <Group justify="space-between" mb={4}>
              <Badge size="sm" variant="light">
                {e.kind}
              </Badge>
              <Text size="xs" c="dimmed">
                {new Date(e.createdAt).toLocaleString()}
              </Text>
            </Group>
            {e.kind === 'SCREENSHOT' && e.url.startsWith('/api/evidence/') ? (
              <Anchor href={e.url} target="_blank" rel="noreferrer">
                <img
                  src={e.url}
                  alt={e.note ?? 'screenshot'}
                  style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 4, display: 'block' }}
                />
              </Anchor>
            ) : (
              <Anchor href={e.url} target="_blank" rel="noreferrer" size="sm">
                {e.url}
              </Anchor>
            )}
            {e.note ? (
              <Text size="xs" c="dimmed" mt={4}>
                {e.note}
              </Text>
            ) : null}
          </Card>
        ))
      )}
      {canWrite ? (
        <>
          <Divider label="Upload file" labelPosition="center" />
          <EvidenceUploader
            onPick={(file) => upload.mutate({ file, note: note.trim() || undefined })}
            loading={upload.isPending}
            error={upload.error ? (upload.error as Error).message : undefined}
          />
          <Divider label="Or attach URL" labelPosition="center" />
          <Group grow>
            <Select
              label="Kind"
              size="sm"
              data={['LINK', 'SCREENSHOT', 'LOG', 'OTHER']}
              value={kind}
              onChange={(v) => setKind(v ?? 'LINK')}
            />
            <TextInput
              label="URL"
              size="sm"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
            />
          </Group>
          <TextInput label="Note (optional)" size="sm" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={() => onSubmit({ kind, url: url.trim(), note: note.trim() || undefined })}
              disabled={!url.trim() || loading}
              loading={loading}
            >
              Attach URL
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
}

function EvidenceUploader({
  onPick,
  loading,
  error,
}: {
  onPick: (file: File) => void
  loading: boolean
  error?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputId = useMemo(() => `evidence-upload-${Math.random().toString(36).slice(2, 8)}`, [])

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onPick(files[0])
  }

  return (
    <Stack gap={6}>
      <label htmlFor={inputId}>
        <Card
          withBorder
          radius="md"
          padding="lg"
          style={{
            borderStyle: 'dashed',
            borderColor: dragOver ? 'var(--mantine-color-blue-5)' : undefined,
            backgroundColor: dragOver ? 'var(--mantine-color-blue-0)' : undefined,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'all 120ms ease',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (loading) return
            handleFiles(e.dataTransfer.files)
          }}
        >
          <Stack gap={4} align="center">
            <TbCloudUpload size={28} />
            <Text size="sm" fw={500}>
              {loading ? 'Uploading…' : dragOver ? 'Drop file to upload' : 'Drag & drop or click to select'}
            </Text>
            <Text size="xs" c="dimmed">
              Screenshots, logs, PDFs — anything under the size limit
            </Text>
          </Stack>
        </Card>
      </label>
      <input
        id={inputId}
        type="file"
        style={{ display: 'none' }}
        disabled={loading}
        onChange={(e) => {
          handleFiles(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      {error ? (
        <Text size="xs" c="red">
          <TbUpload size={10} style={{ marginRight: 4 }} />
          {error}
        </Text>
      ) : null}
    </Stack>
  )
}

function useWasLoading(loading: boolean): boolean {
  const [was, setWas] = useState(false)
  useEffect(() => {
    if (loading) setWas(true)
  }, [loading])
  return was
}

function HoursProgressCard({ task }: { task: TaskDetail }) {
  const variance = task.estimateHours != null && task.actualHours != null ? task.actualHours - task.estimateHours : null
  const varianceColor = variance == null ? undefined : variance > 0 ? 'red' : 'green'

  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="xl" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed">
            <TbClock size={10} style={{ marginRight: 4 }} />
            Estimate
          </Text>
          <Text fw={600}>{task.estimateHours != null ? `${task.estimateHours}h` : '—'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Actual (wall clock)
          </Text>
          <Text fw={600}>
            {task.actualHours != null ? `${task.actualHours}h` : task.status === 'CLOSED' ? '0h' : '—'}
          </Text>
        </div>
        {variance != null && (
          <div>
            <Text size="xs" c="dimmed">
              Variance
            </Text>
            <Text fw={600} c={varianceColor}>
              {variance > 0 ? '+' : ''}
              {variance.toFixed(1)}h
            </Text>
          </div>
        )}
        {task.progressPercent != null && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Progress
              </Text>
              <Text size="xs" c="dimmed">
                {task.progressPercent}%
              </Text>
            </Group>
            <Progress
              value={task.progressPercent}
              size="sm"
              mt={2}
              color={task.status === 'CLOSED' ? 'green' : 'blue'}
            />
          </div>
        )}
      </Group>
    </Card>
  )
}

function formatHoursMinutes(hours: number): string {
  if (hours <= 0) return '0m'
  if (hours < 1) {
    const mins = Math.round(hours * 60)
    return `${mins}m`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function AwFocusCard({ focus, task }: { focus: AwFocus; task: TaskDetail }) {
  const matchRatio =
    focus.matchedHours != null && focus.focusHours > 0
      ? Math.min(100, Math.round((focus.matchedHours / focus.focusHours) * 100))
      : null
  const windowLabel = `${new Date(focus.windowStart).toLocaleDateString()} → ${
    task.closedAt ? new Date(focus.windowEnd).toLocaleDateString() : 'now'
  }`

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <TbDeviceDesktop size={14} />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              ActivityWatch focus
            </Text>
          </Group>
          <Tooltip
            label={`From ${new Date(focus.windowStart).toLocaleString()} to ${new Date(focus.windowEnd).toLocaleString()}`}
          >
            <Text size="xs" c="dimmed">
              {windowLabel}
            </Text>
          </Tooltip>
        </Group>

        {focus.eventCount === 0 ? (
          <Text size="xs" c="dimmed">
            No tracked activity in this window yet.
          </Text>
        ) : (
          <>
            <Group gap="xl" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed">
                  Focus time
                </Text>
                <Text fw={600}>{formatHoursMinutes(focus.focusHours)}</Text>
              </div>
              {focus.matchedHours != null && (
                <div>
                  <Text size="xs" c="dimmed">
                    <TbTarget size={10} style={{ marginRight: 4 }} />
                    On-task (keyword match)
                  </Text>
                  <Text fw={600} c={matchRatio != null && matchRatio >= 30 ? 'green' : undefined}>
                    {formatHoursMinutes(focus.matchedHours)}
                    {matchRatio != null ? ` · ${matchRatio}%` : ''}
                  </Text>
                </div>
              )}
              <div>
                <Text size="xs" c="dimmed">
                  Events
                </Text>
                <Text fw={600}>{focus.eventCount.toLocaleString()}</Text>
              </div>
              {task.estimateHours != null && focus.focusHours > 0 && (
                <div>
                  <Text size="xs" c="dimmed">
                    vs estimate
                  </Text>
                  <Text fw={600} c={focus.focusHours > task.estimateHours ? 'red' : 'green'}>
                    {focus.focusHours > task.estimateHours ? '+' : ''}
                    {(focus.focusHours - task.estimateHours).toFixed(1)}h
                  </Text>
                </div>
              )}
            </Group>

            {focus.matchKeywords.length > 0 && (
              <Group gap={4} wrap="wrap">
                <Text size="xs" c="dimmed">
                  Matching:
                </Text>
                {focus.matchKeywords.slice(0, 8).map((k) => (
                  <Badge key={k} size="xs" variant="dot" color="teal">
                    {k}
                  </Badge>
                ))}
              </Group>
            )}

            {focus.topApps.length > 0 && (
              <div>
                <Group gap="xs" mb={4}>
                  <TbApps size={12} />
                  <Text size="xs" c="dimmed" fw={500}>
                    Top apps
                  </Text>
                </Group>
                <Stack gap={2}>
                  {focus.topApps.slice(0, 5).map((a) => {
                    const pct = focus.focusHours > 0 ? Math.round((a.seconds / 3600 / focus.focusHours) * 100) : 0
                    return (
                      <Group key={a.app} gap="xs" wrap="nowrap" justify="space-between">
                        <Text size="xs" truncate style={{ flex: 1, minWidth: 0 }}>
                          {a.app}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ minWidth: 90, textAlign: 'right' }}>
                          {formatHoursMinutes(a.seconds / 3600)} · {pct}%
                        </Text>
                      </Group>
                    )
                  })}
                </Stack>
              </div>
            )}

            {focus.topTitles.length > 0 && (
              <div>
                <Text size="xs" c="dimmed" fw={500} mb={4}>
                  Top window titles
                </Text>
                <Stack gap={2}>
                  {focus.topTitles.slice(0, 5).map((t) => (
                    <Group key={`${t.app}|${t.title}`} gap="xs" wrap="nowrap" justify="space-between">
                      <Text size="xs" truncate style={{ flex: 1, minWidth: 0 }}>
                        <Text span c="dimmed" size="xs">
                          {t.app} ·{' '}
                        </Text>
                        {t.title}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ minWidth: 60, textAlign: 'right' }}>
                        {formatHoursMinutes(t.seconds / 3600)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </div>
            )}
          </>
        )}
      </Stack>
    </Card>
  )
}

function EstimateField({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [local, setLocal] = useState<number | string>(value ?? '')
  useEffect(() => {
    setLocal(value ?? '')
  }, [value])
  return (
    <NumberInput
      label="Estimate (hours)"
      placeholder="e.g. 2.5"
      size="sm"
      min={0}
      step={0.5}
      decimalScale={2}
      leftSection={<TbClock size={14} />}
      value={local}
      onChange={setLocal}
      onBlur={() => {
        const committed = typeof local === 'number' ? local : null
        if (committed !== value) onCommit(committed)
      }}
    />
  )
}

function TagsPicker({
  projectId: _projectId,
  currentTagIds,
  availableTags,
  onChange,
  onCreate,
  creating,
}: {
  projectId: string
  currentTagIds: string[]
  availableTags: TagListItem[]
  onChange: (tagIds: string[]) => void
  onCreate: (name: string) => void
  creating: boolean
}) {
  const [newName, setNewName] = useState('')
  return (
    <Stack gap={4}>
      <MultiSelect
        label="Tags"
        placeholder="Pick tags"
        size="sm"
        leftSection={<TbTag size={14} />}
        data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
        value={currentTagIds}
        onChange={onChange}
        searchable
        clearable
      />
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="sm"
          placeholder="New tag name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button
          size="sm"
          variant="light"
          leftSection={<TbPlus size={14} />}
          disabled={!newName.trim() || creating}
          loading={creating}
          onClick={() => {
            onCreate(newName.trim())
            setNewName('')
          }}
        >
          Create tag
        </Button>
      </Group>
    </Stack>
  )
}

function ChecklistSection({
  items,
  canWrite,
  onToggle,
  onAdd,
  onRemove,
  adding,
}: {
  items: ChecklistItem[]
  canWrite: boolean
  onToggle: (id: string, done: boolean) => void
  onAdd: (title: string) => void
  onRemove: (id: string) => void
  adding: boolean
}) {
  const [title, setTitle] = useState('')
  const done = items.filter((i) => i.done).length
  return (
    <Stack gap="xs">
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No checklist items yet.
        </Text>
      ) : (
        <>
          <Progress
            value={items.length ? (done / items.length) * 100 : 0}
            size="xs"
            color={done === items.length ? 'green' : 'blue'}
          />
          <Stack gap={4}>
            {items.map((item) => (
              <Group key={item.id} justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Checkbox
                    checked={item.done}
                    disabled={!canWrite}
                    onChange={(e) => onToggle(item.id, e.currentTarget.checked)}
                  />
                  <Text
                    size="sm"
                    truncate
                    td={item.done ? 'line-through' : undefined}
                    c={item.done ? 'dimmed' : undefined}
                  >
                    {item.title}
                  </Text>
                </Group>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRemove(item.id)}>
                    <TbTrash size={12} />
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>
        </>
      )}
      {canWrite && (
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="sm"
            placeholder="Add item"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim() && !adding) {
                onAdd(title.trim())
                setTitle('')
              }
            }}
          />
          <Button
            size="sm"
            leftSection={<TbPlus size={14} />}
            disabled={!title.trim() || adding}
            loading={adding}
            onClick={() => {
              onAdd(title.trim())
              setTitle('')
            }}
          >
            Add
          </Button>
        </Group>
      )}
    </Stack>
  )
}

function DependenciesSection({
  task,
  projectTasks,
  canWrite,
  onAdd,
  onRemove,
}: {
  task: TaskDetail
  projectTasks: Array<{ id: string; title: string; status: TaskStatus }>
  canWrite: boolean
  onAdd: (blockedById: string) => void
  onRemove: (blockedById: string) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const existingIds = new Set(task.blockedBy.map((b) => b.blockedById))
  const options = projectTasks
    .filter((t) => t.id !== task.id && !existingIds.has(t.id))
    .map((t) => ({ value: t.id, label: `${t.title} (${t.status.replace('_', ' ')})` }))

  return (
    <Stack gap="sm">
      <div>
        <Text size="xs" c="dimmed" fw={500} mb={4}>
          Blocked by
        </Text>
        {task.blockedBy.length === 0 ? (
          <Text size="xs" c="dimmed">
            Not blocked by any tasks.
          </Text>
        ) : (
          <Stack gap={4}>
            {task.blockedBy.map((b) => (
              <Group key={b.id} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Badge size="xs" color={STATUS_COLOR[b.blockedBy.status]} variant="light">
                    {b.blockedBy.status.replace('_', ' ')}
                  </Badge>
                  <Text size="sm" truncate>
                    {b.blockedBy.title}
                  </Text>
                </Group>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRemove(b.blockedById)}>
                    <TbX size={12} />
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </div>
      {task.blocks.length > 0 && (
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            Blocks
          </Text>
          <Stack gap={4}>
            {task.blocks.map((b) => (
              <Group key={b.id} gap="xs" wrap="nowrap">
                <Badge size="xs" color={STATUS_COLOR[b.task.status]} variant="light">
                  {b.task.status.replace('_', ' ')}
                </Badge>
                <Text size="sm" truncate>
                  {b.task.title}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}
      {canWrite && (
        <Group gap="xs" wrap="nowrap">
          <Select
            size="sm"
            placeholder="Pick a task that blocks this"
            data={options}
            value={picked}
            onChange={setPicked}
            searchable
            clearable
            style={{ flex: 1 }}
            nothingFoundMessage={options.length === 0 ? 'No other tasks available' : 'No match'}
          />
          <Button
            size="sm"
            leftSection={<TbPlus size={14} />}
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onAdd(picked)
                setPicked(null)
              }
            }}
          >
            Add
          </Button>
        </Group>
      )}
    </Stack>
  )
}

function ActivityTimelineSection({ task }: { task: TaskDetail }) {
  const events = useMemo(() => {
    type Event = { at: string; kind: 'status' | 'comment' | 'evidence'; text: string; author: string | null }
    const out: Event[] = []
    out.push({
      at: task.createdAt,
      kind: 'status',
      text: `Created as ${task.kind} · OPEN`,
      author: task.reporter.name,
    })
    for (const s of task.statusChanges) {
      out.push({
        at: s.createdAt,
        kind: 'status',
        text: `${s.fromStatus.replace('_', ' ')} → ${s.toStatus.replace('_', ' ')}`,
        author: s.author?.name ?? null,
      })
    }
    for (const c of task.comments) {
      out.push({
        at: c.createdAt,
        kind: 'comment',
        text: c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body,
        author: c.author.name,
      })
    }
    for (const e of task.evidence) {
      out.push({
        at: e.createdAt,
        kind: 'evidence',
        text: `${e.kind}: ${e.url}`,
        author: null,
      })
    }
    if (task.closedAt) {
      out.push({
        at: task.closedAt,
        kind: 'status',
        text: `Closed${task.actualHours != null ? ` · ${task.actualHours}h wall clock` : ''}`,
        author: task.assignee?.name ?? task.reporter.name,
      })
    }
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [task])

  return (
    <Stack gap="xs">
      {events.map((e) => (
        <Group
          key={`${e.kind}-${new Date(e.at).getTime()}-${e.text.slice(0, 24)}`}
          gap="xs"
          wrap="nowrap"
          align="flex-start"
        >
          <Badge
            size="xs"
            variant="light"
            color={e.kind === 'status' ? 'violet' : e.kind === 'comment' ? 'blue' : 'teal'}
            leftSection={
              e.kind === 'status' ? (
                <TbCheck size={10} />
              ) : e.kind === 'comment' ? (
                <TbMessage size={10} />
              ) : (
                <TbPaperclip size={10} />
              )
            }
          >
            {e.kind}
          </Badge>
          <div style={{ flex: 1 }}>
            <Text size="sm">{e.text}</Text>
            <Text size="xs" c="dimmed">
              {new Date(e.at).toLocaleString()}
              {e.author ? ` · ${e.author}` : ''}
            </Text>
          </div>
        </Group>
      ))}
    </Stack>
  )
}
