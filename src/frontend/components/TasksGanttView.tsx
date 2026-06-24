import { Card, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Gantt, type GanttTask } from 'mantine-gantt'
import { useCallback, useMemo, useRef, useState } from 'react'
import { TbListCheck } from 'react-icons/tb'
import { notifyError } from '../lib/notify'
import { GanttTaskList, type GanttTaskMeta } from './GanttTaskList'
import { GanttStatsBar } from './tasksganttview/GanttStatsBar'
import { GanttToolbar } from './tasksganttview/GanttToolbar'
import { useGanttScroll } from './tasksganttview/useGanttScroll'
import {
  api,
  COL_WIDTH,
  HEADER_HEIGHT,
  OVERDUE_COLOR,
  ROW_HEIGHT,
  SAVE_DELAY_MS,
  STATUS_COLOR,
  STATUS_PROGRESS,
  TASK_LIST_WIDTH,
  type TaskListItem,
  type ViewMode,
} from './tasksganttview/types'

export function TasksGanttView({ tasks, onSelect }: { tasks: TaskListItem[]; onSelect: (id: string) => void }) {
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>({
    key: 'pm:tasks:gantt-view',
    defaultValue: 'week',
  })

  const pendingRef = useRef<Map<string, { startsAt: string; dueAt: string }>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedScrollRef = useRef<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [listCollapsed, setListCollapsed] = useLocalStorage({
    key: 'pm:tasks:gantt-list-collapsed',
    defaultValue: false,
  })

  const withDates = useMemo(() => tasks.filter((t) => (t.startsAt || t.createdAt) && t.dueAt), [tasks])
  const withoutDates = tasks.length - withDates.length
  const now = useMemo(() => new Date(), [])

  const stats = useMemo(
    () => ({
      open: withDates.filter((t) => t.status === 'OPEN').length,
      inProgress: withDates.filter((t) => t.status === 'IN_PROGRESS').length,
      qc: withDates.filter((t) => t.status === 'READY_FOR_QC').length,
      reopened: withDates.filter((t) => t.status === 'REOPENED').length,
      closed: withDates.filter((t) => t.status === 'CLOSED').length,
      overdue: withDates.filter((t) => t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt) < now).length,
    }),
    [withDates, now],
  )

  const { timelineStart, timelineEnd } = useMemo(() => {
    if (withDates.length === 0) return { timelineStart: undefined, timelineEnd: undefined }
    const allMs = withDates.flatMap((t) => [
      new Date(t.startsAt ?? t.createdAt).getTime(),
      new Date(t.dueAt as string).getTime(),
    ])
    const toLocalMidnight = (ms: number) => {
      const d = new Date(ms)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }
    return {
      timelineStart: toLocalMidnight(Math.min(...allMs) - 7 * 86_400_000),
      timelineEnd: toLocalMidnight(Math.max(...allMs) + 14 * 86_400_000),
    }
  }, [withDates])

  const { taskListBodyRef, ganttWrapperRef, syncScrollFromGantt, syncScrollFromList, scrollToToday } =
    useGanttScroll({ timelineStart, viewMode, now, savedScrollRef })

  const updateTask = useMutation({
    mutationFn: ({ id, startsAt, dueAt }: { id: string; startsAt: string; dueAt: string }) =>
      api(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt, dueAt }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setSaving(false)
    },
    onError: (err) => {
      notifyError(err)
      setSaving(false)
    },
  })

  const addDependency = useMutation({
    mutationFn: ({ taskId, blockedById }: { taskId: string; blockedById: string }) =>
      api(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedById }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => notifyError(err),
  })

  const removeDependency = useMutation({
    mutationFn: ({ taskId, blockedById }: { taskId: string; blockedById: string }) =>
      api(`/api/tasks/${taskId}/dependencies/${blockedById}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => notifyError(err),
  })

  const handleLinkCreate = useCallback(
    (fromTaskId: string, toTaskId: string) => {
      // Simpan scroll position sebelum remount akibat key change
      const body = ganttWrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
      if (body) savedScrollRef.current = body.scrollLeft
      const already = withDates.find((t) => t.id === toTaskId)?.blockedBy.some((b) => b.blockedById === fromTaskId)
      if (already) {
        removeDependency.mutate({ taskId: toTaskId, blockedById: fromTaskId })
      } else {
        addDependency.mutate({ taskId: toTaskId, blockedById: fromTaskId })
      }
    },
    [addDependency, removeDependency, withDates, ganttWrapperRef],
  )

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

  const ganttTasks = useMemo<GanttTask[]>(
    () =>
      withDates.map((t) => {
        const startDate = new Date(t.startsAt ?? t.createdAt)
        const endDate = new Date(t.dueAt as string)
        const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const endMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        const duration = Math.max(1, Math.round((endMidnight.getTime() - startMidnight.getTime()) / 86_400_000) + 1)
        const isOverdue = t.status !== 'CLOSED' && endDate < now
        return {
          id: t.id,
          label: t.title,
          startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}T00:00:00`,
          duration,
          progress: t.progressPercent ?? STATUS_PROGRESS[t.status],
          color: isOverdue ? OVERDUE_COLOR : STATUS_COLOR[t.status],
          dependencies: t.blockedBy.map((b) => b.blockedById),
        }
      }),
    [withDates, now],
  )

  const taskMetas = useMemo<GanttTaskMeta[]>(
    () =>
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
        startsAt: t.startsAt,
        dueAt: t.dueAt,
      })),
    [withDates, now],
  )

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

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="sm">
        <GanttToolbar
          taskCount={withDates.length}
          withoutDates={withoutDates}
          overdueCount={stats.overdue}
          saving={saving}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onScrollToToday={() => scrollToToday()}
        />
        <GanttStatsBar stats={stats} totalCount={withDates.length} />

        {/* Gantt + custom left panel */}
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
          <div ref={ganttWrapperRef} style={{ flex: 1, overflow: 'hidden' }} onScroll={syncScrollFromGantt}>
            <Gantt
              key={ganttTasks.map((t) => `${t.id}:${(t.dependencies ?? []).join('|')}`).join(',')}
              tasks={ganttTasks}
              viewMode={viewMode}
              startDate={timelineStart}
              endDate={timelineEnd}
              columnWidth={COL_WIDTH[viewMode]}
              rowHeight={ROW_HEIGHT}
              taskListWidth={0}
              showTodayMarker
              onTaskUpdate={handleTaskUpdate}
              onLinkCreate={handleLinkCreate}
              onTaskClick={(t) => onSelect(t.id)}
              showTitle
              styles={{ taskList: { display: 'none' } }}
            />
          </div>
        </div>

        <Text size="xs" c="dimmed" ta="center">
          {'💡'} Seret bar untuk ubah jadwal &middot; Tarik tepi bar untuk ubah durasi &middot; Klik bar
          untuk buka detail &middot; Tarik ujung bar ke bar lain untuk tambah dependency &middot; Hapus dependency
          via tab Dependencies di detail task
        </Text>
      </Stack>
    </Card>
  )
}
