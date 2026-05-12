import { ActionIcon, Badge, Card, Divider, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TbAlertTriangle, TbCalendarOff, TbCalendarEvent, TbListCheck } from 'react-icons/tb'
import { Gantt, type GanttTask } from 'mantine-gantt'
import { notifyError } from '../lib/notify'
import { GanttTaskList, type GanttTaskMeta } from './GanttTaskList'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskKind = 'TASK' | 'BUG' | 'QC'

interface TaskUser {
  id: string; name: string; email: string; role: string
  image?: string | null
}
interface TaskTag { tagId: string; tag: { id: string; name: string; color: string; projectId: string } }

interface TaskListItem {
  id: string; projectId: string; kind: TaskKind; title: string; description: string
  status: TaskStatus; priority: TaskPriority; route: string | null
  reporter: TaskUser; assignee: TaskUser | null
  startsAt: string | null; dueAt: string | null
  estimateHours: number | null; actualHours: number | null; progressPercent: number | null
  createdAt: string; updatedAt: string; closedAt: string | null
  project: { id: string; name: string }; tags: TaskTag[]
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Distinct muted colors per status — identifiable at a glance in dark mode
const STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN:         '#4a7abf',  // steel blue
  IN_PROGRESS:  '#7b5ea7',  // soft purple
  READY_FOR_QC: '#c49a28',  // amber
  REOPENED:     '#b86d2a',  // burnt orange
  CLOSED:       '#3a8f6a',  // muted green
}
const OVERDUE_COLOR = '#a84444'  // muted red

const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', READY_FOR_QC: 'Ready for QC',
  REOPENED: 'Reopened', CLOSED: 'Closed',
}

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  OPEN: 0, IN_PROGRESS: 30, READY_FOR_QC: 80, REOPENED: 20, CLOSED: 100,
}

// Column width per view mode — passed to mantine-gantt as base unit
// mantine-gantt divides this internally for week (/2) and month (/6)
const COL_WIDTH: Record<ViewMode, number> = { day: 44, week: 120, month: 120 }
// mantine-gantt effective per-day pixel: day=colWidth, week=colWidth/2, month=colWidth/6
const EFFECTIVE_DAY_PX: Record<ViewMode, number> = {
  day: 44,
  week: Math.max(120 / 2, 14),
  month: Math.max(120 / 6, 7),
}

const TASK_LIST_WIDTH = 280
const ROW_HEIGHT = 52
const HEADER_HEIGHT = 50

const SAVE_DELAY_MS = 800

type ViewMode = 'day' | 'week' | 'month'

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'day', label: 'Hari' },
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function TasksGanttView({
  tasks,
  onSelect,
}: {
  tasks: TaskListItem[]
  onSelect: (id: string) => void
}) {
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>({
    key: 'pm:tasks:gantt-view',
    defaultValue: 'week',
  })

  const pendingRef = useRef<Map<string, { startsAt: string; dueAt: string }>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [listCollapsed, setListCollapsed] = useLocalStorage({
    key: 'pm:tasks:gantt-list-collapsed',
    defaultValue: false,
  })

  // Sync scroll: custom left panel ↔ mantine-gantt timeline body
  const taskListBodyRef = useRef<HTMLDivElement>(null)
  const ganttWrapperRef = useRef<HTMLDivElement>(null)
  const isSyncingRef = useRef(false)

  const syncScrollFromGantt = useCallback(() => {
    if (isSyncingRef.current) return
    const ganttBody = ganttWrapperRef.current?.querySelector<HTMLDivElement>(
      '[class*="taskListBody"]',
    )
    if (!ganttBody || !taskListBodyRef.current) return
    isSyncingRef.current = true
    taskListBodyRef.current.scrollTop = ganttBody.scrollTop
    isSyncingRef.current = false
  }, [])

  const syncScrollFromList = useCallback(() => {
    if (isSyncingRef.current) return
    const ganttBody = ganttWrapperRef.current?.querySelector<HTMLDivElement>(
      '[class*="taskListBody"]',
    )
    if (!ganttBody || !taskListBodyRef.current) return
    isSyncingRef.current = true
    ganttBody.scrollTop = taskListBodyRef.current.scrollTop
    isSyncingRef.current = false
  }, [])

  // ─── Filtered tasks ─────────────────────────────────────────────────────────
  const withDates = useMemo(
    () => tasks.filter((t) => (t.startsAt || t.createdAt) && t.dueAt),
    [tasks],
  )
  const withoutDates = tasks.length - withDates.length
  const now = useMemo(() => new Date(), [])

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    open: withDates.filter((t) => t.status === 'OPEN').length,
    inProgress: withDates.filter((t) => t.status === 'IN_PROGRESS').length,
    qc: withDates.filter((t) => t.status === 'READY_FOR_QC').length,
    reopened: withDates.filter((t) => t.status === 'REOPENED').length,
    closed: withDates.filter((t) => t.status === 'CLOSED').length,
    overdue: withDates.filter(
      (t) => t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt) < now,
    ).length,
  }), [withDates, now])

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const updateTask = useMutation({
    mutationFn: ({ id, startsAt, dueAt }: { id: string; startsAt: string; dueAt: string }) =>
      api(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt, dueAt }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setSaving(false) },
    onError: (err) => { notifyError(err); setSaving(false) },
  })

  const flushPending = useCallback(() => {
    const entries = Array.from(pendingRef.current.entries())
    pendingRef.current.clear()
    if (entries.length === 0) return
    setSaving(true)
    Promise.all(
      entries.map(([id, { startsAt, dueAt }]) =>
        updateTask.mutateAsync({ id, startsAt, dueAt }).catch((err) => notifyError(err)),
      ),
    ).finally(() => setSaving(false))
  }, [updateTask])

  const handleTaskUpdate = useCallback(
    (updated: GanttTask) => {
      const startDate = new Date(updated.startDate)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + updated.duration)
      pendingRef.current.set(updated.id, {
        startsAt: startDate.toISOString(),
        dueAt: endDate.toISOString(),
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flushPending, SAVE_DELAY_MS)
    },
    [flushPending],
  )

  // ─── Task data ──────────────────────────────────────────────────────────────
  const ganttTasks = useMemo<GanttTask[]>(() =>
    withDates.map((t) => {
      const startDate = new Date(t.startsAt ?? t.createdAt)
      const endDate = new Date(t.dueAt as string)
      const duration = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000))
      const isOverdue = t.status !== 'CLOSED' && endDate < now
      return {
        id: t.id,
        label: t.title,
        startDate: startDate.toISOString().slice(0, 10),
        duration,
        progress: t.progressPercent ?? STATUS_PROGRESS[t.status],
        color: isOverdue ? OVERDUE_COLOR : STATUS_COLOR[t.status],
        dependencies: [],
      }
    }), [withDates, now])

  const taskMetas = useMemo<GanttTaskMeta[]>(() =>
    withDates.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      status: t.status,
      priority: t.priority,
      assigneeName: t.assignee?.name ?? null,
      assigneeImage: t.assignee?.image ?? null,
      isOverdue: t.status !== 'CLOSED' && !!t.dueAt && new Date(t.dueAt) < now,
      progress: t.progressPercent ?? STATUS_PROGRESS[t.status],
    })), [withDates, now])

  // ─── Timeline bounds ────────────────────────────────────────────────────────
  const { timelineStart, timelineEnd } = useMemo(() => {
    if (withDates.length === 0) return { timelineStart: undefined, timelineEnd: undefined }
    const allMs = withDates.flatMap((t) => [
      new Date(t.startsAt ?? t.createdAt).getTime(),
      new Date(t.dueAt as string).getTime(),
    ])
    return {
      timelineStart: new Date(Math.min(...allMs) - 7 * 86_400_000),
      timelineEnd: new Date(Math.max(...allMs) + 14 * 86_400_000),
    }
  }, [withDates])

  const scrollToToday = useCallback(() => {
    if (!timelineStart) return
    const body = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body) return
    const daysSinceStart = Math.floor((now.getTime() - timelineStart.getTime()) / 86_400_000)
    const todayPx = daysSinceStart * EFFECTIVE_DAY_PX[viewMode]
    body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior: 'smooth' })
  }, [timelineStart, viewMode, now])

  // Auto-scroll on first render after columns are ready
  useEffect(() => {
    if (!timelineStart) return
    let attempts = 0
    const tryScroll = () => {
      const body = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (!body || body.scrollWidth <= body.clientWidth + 10) {
        if (++attempts < 30) setTimeout(tryScroll, 100)
        return
      }
      scrollToToday()
    }
    setTimeout(tryScroll, 100)
  }, [timelineStart, viewMode, ganttTasks.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (withDates.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <TbListCheck size={32} />
          <Text fw={500}>Belum ada task dengan due date</Text>
          <Text size="sm" c="dimmed" ta="center" maw={360}>
            Set due date pada task untuk memunculkannya di Gantt.
            {withoutDates > 0 && ` ${withoutDates} task saat ini tidak memiliki jadwal.`}
          </Text>
        </Stack>
      </Card>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="sm">

        {/* ── Toolbar ── */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              {withDates.length} task · seret bar untuk reschedule · klik untuk detail
            </Text>
            {stats.overdue > 0 && (
              <Tooltip label={`${stats.overdue} task melewati deadline`} withArrow>
                <Badge size="xs" color="red" variant="light" leftSection={<TbAlertTriangle size={10} />}>
                  {stats.overdue} overdue
                </Badge>
              </Tooltip>
            )}
            {withoutDates > 0 && (
              <Tooltip label={`${withoutDates} task tidak ditampilkan karena belum memiliki due date`} withArrow>
                <Badge size="xs" color="gray" variant="outline" leftSection={<TbCalendarOff size={10} />}>
                  +{withoutDates} tanpa jadwal
                </Badge>
              </Tooltip>
            )}
            {saving && <Badge size="xs" color="blue" variant="dot">Menyimpan…</Badge>}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Scroll ke hari ini" withArrow>
              <ActionIcon variant="light" size="sm" color="red" onClick={scrollToToday}>
                <TbCalendarEvent size={14} />
              </ActionIcon>
            </Tooltip>
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              data={VIEW_OPTIONS}
              style={{ flexShrink: 0 }}
            />
          </Group>
        </Group>

        {/* ── Stats bar ── */}
        <Group gap={6} wrap="wrap">
          {([
            { count: stats.open,       label: 'Open',        color: STATUS_COLOR.OPEN },
            { count: stats.inProgress, label: 'In Progress', color: STATUS_COLOR.IN_PROGRESS },
            { count: stats.qc,         label: 'QC',          color: STATUS_COLOR.READY_FOR_QC },
            { count: stats.reopened,   label: 'Reopened',    color: STATUS_COLOR.REOPENED },
            { count: stats.closed,     label: 'Closed',      color: STATUS_COLOR.CLOSED },
          ] as const).filter(s => s.count > 0).map(s => (
            <Badge
              key={s.label}
              size="sm"
              variant="default"
              style={{ border: 'none' }}
              leftSection={<div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }} />}
            >
              {s.count} {s.label}
            </Badge>
          ))}
          {stats.overdue > 0 && (
            <Badge size="sm" variant="default" style={{ border: 'none' }}
              leftSection={<div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: OVERDUE_COLOR, flexShrink: 0 }} />}
            >
              {stats.overdue} Overdue
            </Badge>
          )}
          <Divider orientation="vertical" />
          <Text size="xs" c="dimmed">Total {withDates.length}</Text>
        </Group>

        {/* ── Gantt + custom left panel ── */}
        <div
          style={{
            display: 'flex',
            height: Math.max(320, withDates.length * ROW_HEIGHT + HEADER_HEIGHT + 20),
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          {/* Custom left panel dengan avatar assignee */}
          <GanttTaskList
            ref={taskListBodyRef}
            tasks={taskMetas}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            width={TASK_LIST_WIDTH}
            collapsed={listCollapsed}
            onToggleCollapse={() => setListCollapsed((v) => !v)}
            onTaskClick={onSelect}
            onScroll={syncScrollFromList}
          />

          {/* Mantine-gantt: sembunyikan left panel bawaan (taskListWidth=0) */}
          <div
            ref={ganttWrapperRef}
            style={{ flex: 1, overflow: 'hidden' }}
            onScroll={syncScrollFromGantt}
          >
            <Gantt
              tasks={ganttTasks}
              viewMode={viewMode}
              startDate={timelineStart}
              endDate={timelineEnd}
              columnWidth={COL_WIDTH[viewMode]}
              rowHeight={ROW_HEIGHT}
              taskListWidth={0}
              showTodayMarker
              onTaskUpdate={handleTaskUpdate}
              onTaskClick={(t) => onSelect(t.id)}
              showTitle
              styles={{ taskList: { display: 'none' } }}
            />
          </div>
        </div>

        {/* ── Hint ── */}
        <Text size="xs" c="dimmed" ta="center">
          💡 Seret bar untuk ubah jadwal · Tarik tepi bar untuk ubah durasi · Klik bar untuk buka detail
        </Text>

      </Stack>
    </Card>
  )
}
