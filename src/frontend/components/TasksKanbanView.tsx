import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { ActionIcon, Badge, Button, Card, Group, Loader, Pagination, Skeleton, Stack, Text, Tooltip } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import {
  TbArrowsMaximize,
  TbArrowsMinimize,
  TbCheck,
  TbChecks,
  TbChevronLeft,
  TbChevronRight,
  TbTrash,
} from 'react-icons/tb'
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
    IN_PROGRESS: ['OPEN', 'READY_FOR_QC', 'CLOSED'],
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

const KANBAN_COL_SIZE = 20

interface KanbanFilters {
  kind?: string | null
  mine?: boolean
  tagId?: string | null
  phaseId?: string | null
  search?: string
  priority?: string | null
}

export function TasksKanbanView({
  projectId,
  filters,
  canWrite,
  onSelect,
  onDeleteOne,
  onDeleteSelected,
  canDeleteTask,
}: {
  projectId: string | null
  filters: KanbanFilters
  canWrite: boolean
  onSelect: (id: string) => void
  onDeleteOne?: (task: TaskListItem) => void
  onDeleteSelected?: (ids: string[]) => void
  canDeleteTask?: (task: TaskListItem) => boolean
}) {
  const qc = useQueryClient()

  const [colOffset, setColOffset] = useState<Record<TaskStatus, number>>({
    OPEN: 0,
    IN_PROGRESS: 0,
    READY_FOR_QC: 0,
    REOPENED: 0,
    CLOSED: 0,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [colHidden, setColHidden] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-hidden',
    defaultValue: {},
  })
  const [colMax, setColMax] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-max',
    defaultValue: {},
  })
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)

  const buildColParams = (status: TaskStatus, offset: number): string => {
    const p = new URLSearchParams({ status, limit: String(KANBAN_COL_SIZE), offset: String(offset) })
    if (projectId) p.set('projectId', projectId)
    if (filters.kind) p.set('kind', filters.kind)
    if (filters.mine) p.set('mine', '1')
    if (filters.tagId) p.set('tagId', filters.tagId)
    if (filters.phaseId) p.set('phaseId', filters.phaseId)
    if (filters.search) p.set('search', filters.search)
    if (filters.priority) p.set('priority', filters.priority)
    return p.toString()
  }

  const openQ = useQuery({
    queryKey: ['tasks-kanban', 'OPEN', projectId, filters, colOffset.OPEN],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number }>(`/api/tasks?${buildColParams('OPEN', colOffset.OPEN)}`),
    staleTime: 30_000,
  })
  const inProgQ = useQuery({
    queryKey: ['tasks-kanban', 'IN_PROGRESS', projectId, filters, colOffset.IN_PROGRESS],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number }>(
        `/api/tasks?${buildColParams('IN_PROGRESS', colOffset.IN_PROGRESS)}`,
      ),
    staleTime: 30_000,
  })
  const readyQ = useQuery({
    queryKey: ['tasks-kanban', 'READY_FOR_QC', projectId, filters, colOffset.READY_FOR_QC],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number }>(
        `/api/tasks?${buildColParams('READY_FOR_QC', colOffset.READY_FOR_QC)}`,
      ),
    staleTime: 30_000,
  })
  const reopenedQ = useQuery({
    queryKey: ['tasks-kanban', 'REOPENED', projectId, filters, colOffset.REOPENED],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number }>(`/api/tasks?${buildColParams('REOPENED', colOffset.REOPENED)}`),
    staleTime: 30_000,
  })
  const closedQ = useQuery({
    queryKey: ['tasks-kanban', 'CLOSED', projectId, filters, colOffset.CLOSED],
    queryFn: () =>
      api<{ tasks: TaskListItem[]; total: number }>(`/api/tasks?${buildColParams('CLOSED', colOffset.CLOSED)}`),
    staleTime: 30_000,
  })

  const COL_QUERIES = {
    OPEN: openQ,
    IN_PROGRESS: inProgQ,
    READY_FOR_QC: readyQ,
    REOPENED: reopenedQ,
    CLOSED: closedQ,
  } as const

  // Reset column offsets and selection when projectId or any filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on filter identity
  useEffect(() => {
    setColOffset({ OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0 })
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [projectId, filters.kind, filters.mine, filters.tagId, filters.search, filters.priority])

  const exitSelect = useCallback(() => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelect()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitSelect])

  const allVisibleTasks = KANBAN_COLUMNS.flatMap((col) => COL_QUERIES[col.status].data?.tasks ?? [])
  const draggingTask = draggingTaskId ? allVisibleTasks.find((t) => t.id === draggingTaskId) : null
  const allowedTargets = draggingTask ? kanbanAllowed(draggingTask.status, draggingTask.kind) : []

  const toggleHidden = (s: TaskStatus) => setColHidden((p) => ({ ...p, [s]: !p[s] }))
  const toggleMax = (s: TaskStatus) => setColMax((p) => ({ ...p, [s]: !p[s] }))

  const handleDragEnd = (result: import('@hello-pangea/dnd').DropResult) => {
    setDraggingTaskId(null)
    const { source, destination, draggableId, reason } = result

    if (reason === 'CANCEL' || !destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const srcStatus = source.droppableId as TaskStatus
    const dstStatus = destination.droppableId as TaskStatus

    const allTasks = KANBAN_COLUMNS.flatMap((col) => COL_QUERIES[col.status].data?.tasks ?? [])
    const primaryTask = allTasks.find((t) => t.id === draggableId)
    if (!primaryTask) return

    const isMulti = selectedIds.has(draggableId) && selectedIds.size > 1
    const tasksToMove = isMulti
      ? allTasks.filter((t) => selectedIds.has(t.id) && kanbanAllowed(t.status, t.kind).includes(dstStatus))
      : [primaryTask]

    const movedIds = new Set(tasksToMove.map((t) => t.id))
    const originalStatusOf = new Map(tasksToMove.map((t) => [t.id, t.status]))

    if (isMulti) setSelectedIds(new Set())

    // Build tentative column state for optimistic cache update
    const tentativeCols: Record<TaskStatus, TaskListItem[]> = {
      OPEN: [...(COL_QUERIES.OPEN.data?.tasks ?? [])],
      IN_PROGRESS: [...(COL_QUERIES.IN_PROGRESS.data?.tasks ?? [])],
      READY_FOR_QC: [...(COL_QUERIES.READY_FOR_QC.data?.tasks ?? [])],
      REOPENED: [...(COL_QUERIES.REOPENED.data?.tasks ?? [])],
      CLOSED: [...(COL_QUERIES.CLOSED.data?.tasks ?? [])],
    }

    if (!isMulti) {
      const [moved] = tentativeCols[srcStatus].splice(source.index, 1)
      if (!moved) return
      if (srcStatus !== dstStatus) {
        const allowed = kanbanAllowed(srcStatus, moved.kind)
        if (!allowed.includes(dstStatus)) return
        tentativeCols[dstStatus].splice(destination.index, 0, { ...moved, status: dstStatus })
      } else {
        tentativeCols[dstStatus].splice(destination.index, 0, moved)
      }
    } else {
      for (const status of Object.keys(tentativeCols) as TaskStatus[]) {
        tentativeCols[status] = tentativeCols[status].filter((t) => !movedIds.has(t.id))
      }
      const others = tasksToMove.filter((t) => t.id !== draggableId)
      tentativeCols[dstStatus].splice(
        destination.index,
        0,
        { ...primaryTask, status: dstStatus },
        ...others.map((t) => ({ ...t, status: dstStatus })),
      )
    }

    const affectedStatuses = isMulti
      ? new Set<TaskStatus>([...(originalStatusOf.values() as unknown as TaskStatus[]), dstStatus])
      : new Set<TaskStatus>(srcStatus === dstStatus ? [srcStatus] : [srcStatus, dstStatus])

    // Optimistic cache update so cards don't snap back before API response
    for (const status of affectedStatuses) {
      const currentData = COL_QUERIES[status].data
      if (currentData) {
        qc.setQueryData(['tasks-kanban', status, projectId, filters, colOffset[status]], {
          ...currentData,
          tasks: tentativeCols[status],
        })
      }
    }

    // Build reorder payload
    const updates: Array<{ id: string; kanbanOrder: number; status?: string }> = []
    for (const status of affectedStatuses) {
      tentativeCols[status].forEach((t, idx) => {
        updates.push({
          id: t.id,
          kanbanOrder: idx,
          ...(movedIds.has(t.id) && originalStatusOf.get(t.id) !== dstStatus ? { status: dstStatus } : {}),
        })
      })
    }

    setTimeout(() => {
      api('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(() => {
          for (const s of affectedStatuses) {
            qc.invalidateQueries({ queryKey: ['tasks-kanban', s, projectId] })
          }
          qc.invalidateQueries({ queryKey: ['tasks'] })
        })
        .catch(() => {
          for (const s of KANBAN_COLUMNS.map((c) => c.status)) {
            qc.invalidateQueries({ queryKey: ['tasks-kanban', s, projectId] })
          }
          qc.invalidateQueries({ queryKey: ['tasks'] })
        })
    }, 0)
  }

  const gridCols = KANBAN_COLUMNS.map((col) =>
    colHidden[col.status] ? '44px' : colMax[col.status] ? 'minmax(360px, 2fr)' : 'minmax(240px, 1fr)',
  ).join(' ')

  const allTaskIds = allVisibleTasks.map((t) => t.id)
  const allSelected = allTaskIds.length > 0 && allTaskIds.every((id) => selectedIds.has(id))
  const deletableSelectedIds = Array.from(selectedIds).filter((id) => {
    const t = allVisibleTasks.find((x) => x.id === id)
    return t && canDeleteTask ? canDeleteTask(t) : !!t
  })

  return (
    <>
      <Group mb={8} justify="space-between" align="center">
        <Group gap={6} align="center">
          {selectMode || selectedIds.size > 0 ? (
            <>
              <Badge size="sm" color="blue" variant="light" style={{ flexShrink: 0 }}>
                {selectedIds.size} dipilih
              </Badge>
              <Button
                size="compact-xs"
                variant="subtle"
                color="blue"
                onClick={() => {
                  if (allSelected) setSelectedIds(new Set())
                  else setSelectedIds(new Set(allTaskIds))
                }}
              >
                {allSelected ? 'Batal semua' : `Pilih semua (${allTaskIds.length})`}
              </Button>
              {selectedIds.size > 0 && (
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  · drag ke kolom tujuan
                </Text>
              )}
              {selectedIds.size > 0 && onDeleteSelected && deletableSelectedIds.length > 0 && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<TbTrash size={11} />}
                  onClick={() => onDeleteSelected(deletableSelectedIds)}
                >
                  Hapus terpilih ({deletableSelectedIds.length})
                </Button>
              )}
              <Button size="compact-xs" variant="subtle" color="gray" onClick={exitSelect}>
                Keluar
              </Button>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              Ctrl+klik atau aktifkan Select untuk pilih banyak
            </Text>
          )}
        </Group>

        <Button
          size="compact-xs"
          variant={selectMode ? 'filled' : 'light'}
          color={selectMode ? 'blue' : 'gray'}
          leftSection={<TbChecks size={12} />}
          onClick={() => {
            if (selectMode) exitSelect()
            else setSelectMode(true)
          }}
        >
          {selectMode ? 'Select ON' : 'Select'}
        </Button>
      </Group>
      <DragDropContext onDragStart={(initial) => setDraggingTaskId(initial.draggableId)} onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, overflowX: 'auto' }}>
          {KANBAN_COLUMNS.map((col) => {
            const colData = COL_QUERIES[col.status]
            const items = colData.data?.tasks ?? []
            const total = colData.data?.total ?? 0
            const isColLoading = colData.isLoading
            const isColFetching = colData.isFetching && !colData.isLoading
            const totalPages = Math.max(1, Math.ceil(total / KANBAN_COL_SIZE))
            const currentPage = Math.floor(colOffset[col.status] / KANBAN_COL_SIZE) + 1
            const isHidden = !!colHidden[col.status]
            const isMax = !!colMax[col.status]
            const isDropDisabled =
              !canWrite ||
              isHidden ||
              (draggingTask !== null &&
                draggingTask !== undefined &&
                draggingTask.status !== col.status &&
                !allowedTargets.includes(col.status))

            return (
              <Card
                key={col.status}
                withBorder
                padding="xs"
                radius="md"
                style={{
                  minHeight: isHidden ? 0 : 240,
                }}
              >
                {isHidden ? (
                  <Stack align="center" gap={4}>
                    <Text size="xs" fw={700} c="dimmed">
                      {total || items.length}
                    </Text>
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
                      <Text size="xs" c="dimmed">
                        {total > 0 ? total : items.length}
                      </Text>
                      {isColFetching && <Loader size={10} color="gray" />}
                    </Group>
                    <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                      {selectMode &&
                        items.length > 0 &&
                        (() => {
                          const colIds = items.map((t) => t.id)
                          const colAllSelected = colIds.every((id) => selectedIds.has(id))
                          return (
                            <Tooltip
                              label={colAllSelected ? 'Batal pilih kolom ini' : `Pilih semua ${items.length} task`}
                            >
                              <ActionIcon
                                size="xs"
                                variant={colAllSelected ? 'filled' : 'light'}
                                color="blue"
                                onClick={() =>
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    if (colAllSelected) {
                                      for (const id of colIds) next.delete(id)
                                    } else {
                                      for (const id of colIds) next.add(id)
                                    }
                                    return next
                                  })
                                }
                              >
                                <TbChecks size={11} />
                              </ActionIcon>
                            </Tooltip>
                          )
                        })()}
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

                {!isHidden && (
                  <>
                    <Droppable droppableId={col.status} isDropDisabled={isDropDisabled}>
                      {(provided, snapshot) => (
                        <Stack
                          gap={6}
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={{
                            minHeight: 40,
                            maxHeight: 'calc(100vh - 280px)',
                            overflowY: 'auto',
                            padding: snapshot.isDraggingOver && !isDropDisabled ? 4 : '0 2px 0 0',
                            background:
                              snapshot.isDraggingOver && !isDropDisabled
                                ? 'var(--mantine-color-blue-light)'
                                : undefined,
                            borderRadius: 'var(--mantine-radius-md)',
                            transition: 'background 120ms ease',
                          }}
                        >
                          {isColLoading && (
                            <Stack gap={6} py={4}>
                              {[0, 1, 2].map((i) => (
                                <Skeleton key={i} h={60} radius="sm" />
                              ))}
                            </Stack>
                          )}
                          {!isColLoading && items.length === 0 && !snapshot.isDraggingOver && (
                            <Text size="xs" c="dimmed" ta="center" py="md">
                              No tasks
                            </Text>
                          )}

                          {items.map((t, idx) => (
                            <Draggable key={t.id} draggableId={t.id} index={idx} isDragDisabled={!canWrite}>
                              {(dragProvided, dragSnapshot) => {
                                const isSelected = selectedIds.has(t.id)
                                const isMultiDrag = dragSnapshot.isDragging && isSelected && selectedIds.size > 1
                                return (
                                  <Card
                                    withBorder
                                    padding="xs"
                                    radius="sm"
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    onClick={(e) => {
                                      if (dragSnapshot.isDragging) return
                                      if (selectMode || e.ctrlKey || e.metaKey) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setSelectedIds((prev) => {
                                          const next = new Set(prev)
                                          next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                                          return next
                                        })
                                      } else {
                                        onSelect(t.id)
                                      }
                                    }}
                                    style={{
                                      cursor: canWrite ? 'grab' : 'pointer',
                                      position: 'relative',
                                      opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                      background: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                                      boxShadow: dragSnapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.18)' : undefined,
                                      ...dragProvided.draggableProps.style,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {selectMode && !dragSnapshot.isDragging && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: 6,
                                          right: 6,
                                          zIndex: 5,
                                          width: 16,
                                          height: 16,
                                          borderRadius: '50%',
                                          flexShrink: 0,
                                          border: `2px solid ${isSelected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-4)'}`,
                                          background: isSelected
                                            ? 'var(--mantine-color-blue-5)'
                                            : 'var(--mantine-color-body)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          pointerEvents: 'none',
                                        }}
                                      >
                                        {isSelected && <TbCheck size={10} color="#fff" />}
                                      </div>
                                    )}

                                    {dragSnapshot.isDragging ? (
                                      <Stack align="center" justify="center" gap={2} style={{ minHeight: 72 }}>
                                        <Text
                                          fw={900}
                                          style={{ fontSize: 40, lineHeight: 1, color: 'var(--mantine-color-blue-6)' }}
                                        >
                                          {isMultiDrag ? selectedIds.size : 1}
                                        </Text>
                                        <Text size="xs" fw={600} c="dimmed">
                                          {(isMultiDrag ? selectedIds.size : 1) === 1 ? 'task' : 'tasks'}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                          dari{' '}
                                          <b>{KANBAN_COLUMNS.find((c) => c.status === t.status)?.label ?? t.status}</b>
                                        </Text>
                                      </Stack>
                                    ) : (
                                      <Stack gap={4}>
                                        <Group gap={4} wrap="wrap">
                                          <Badge size="xs" color={KIND_COLOR[t.kind]} variant="light">
                                            {t.kind}
                                          </Badge>
                                          <Badge size="xs" color={PRIORITY_COLOR[t.priority]} variant="dot">
                                            {t.priority}
                                          </Badge>
                                        </Group>
                                        <Text size="sm" fw={500} lineClamp={2}>
                                          {t.title}
                                        </Text>
                                        {t.tags.length > 0 && (
                                          <Group gap={4} wrap="wrap">
                                            {t.tags.slice(0, 3).map((tg) => (
                                              <Badge key={tg.tagId} size="xs" variant="light" color={tg.tag.color}>
                                                {tg.tag.name}
                                              </Badge>
                                            ))}
                                          </Group>
                                        )}
                                        {t.progressPercent != null && t.progressPercent > 0 && (
                                          <div
                                            style={{
                                              height: 4,
                                              background: 'var(--mantine-color-gray-2)',
                                              borderRadius: 2,
                                              overflow: 'hidden',
                                            }}
                                          >
                                            <div
                                              style={{
                                                width: `${t.progressPercent}%`,
                                                height: '100%',
                                                background:
                                                  t.status === 'CLOSED'
                                                    ? 'var(--mantine-color-green-6)'
                                                    : 'var(--mantine-color-blue-6)',
                                              }}
                                            />
                                          </div>
                                        )}
                                        <Group justify="space-between" wrap="nowrap">
                                          <Tooltip
                                            label={t.assignee ? t.assignee.name : 'Unassigned'}
                                            withArrow
                                            position="bottom"
                                          >
                                            <Group gap={4} wrap="nowrap">
                                              <UserAvatar
                                                name={t.assignee?.name}
                                                image={t.assignee?.image}
                                                size={18}
                                                color="blue"
                                              />
                                              <Text size="xs" c="dimmed" truncate>
                                                {t.assignee ? t.assignee.name.split(' ')[0] : 'Unassigned'}
                                              </Text>
                                            </Group>
                                          </Tooltip>
                                          <Group gap={4} wrap="nowrap">
                                            {t.dueAt && (
                                              <Text
                                                size="xs"
                                                c={
                                                  new Date(t.dueAt) < new Date() && t.status !== 'CLOSED'
                                                    ? 'red'
                                                    : 'dimmed'
                                                }
                                              >
                                                {new Date(t.dueAt).toLocaleDateString('id-ID')}
                                              </Text>
                                            )}
                                            {selectMode && onDeleteOne && (!canDeleteTask || canDeleteTask(t)) && (
                                              <Tooltip label="Hapus task" withArrow position="top">
                                                <ActionIcon
                                                  size="xs"
                                                  variant="subtle"
                                                  color="red"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDeleteOne(t)
                                                  }}
                                                >
                                                  <TbTrash size={12} />
                                                </ActionIcon>
                                              </Tooltip>
                                            )}
                                          </Group>
                                        </Group>
                                      </Stack>
                                    )}
                                  </Card>
                                )
                              }}
                            </Draggable>
                          ))}

                          {provided.placeholder}
                        </Stack>
                      )}
                    </Droppable>

                    {total > KANBAN_COL_SIZE && (
                      <Group
                        justify="center"
                        pt={6}
                        mt={4}
                        style={{ borderTop: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
                      >
                        <Pagination
                          value={currentPage}
                          total={totalPages}
                          size="xs"
                          withEdges={false}
                          siblings={0}
                          boundaries={1}
                          onChange={(page) =>
                            setColOffset((p) => ({ ...p, [col.status]: (page - 1) * KANBAN_COL_SIZE }))
                          }
                        />
                      </Group>
                    )}
                  </>
                )}
              </Card>
            )
          })}
        </div>
      </DragDropContext>
    </>
  )
}
