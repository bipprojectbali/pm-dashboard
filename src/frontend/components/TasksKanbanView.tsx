import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TbArrowsMaximize,
  TbArrowsMinimize,
  TbChevronLeft,
  TbChevronRight,
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

const KANBAN_PAGE = 20

export function TasksKanbanView({
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
                                  <Tooltip label={t.assignee ? t.assignee.name : 'Unassigned'} withArrow position="bottom">
                                    <Group gap={4} wrap="nowrap">
                                      <UserAvatar name={t.assignee?.name} image={t.assignee?.image} size={18} color="blue" />
                                      <Text size="xs" c="dimmed" truncate>{t.assignee ? t.assignee.name.split(' ')[0] : 'Unassigned'}</Text>
                                    </Group>
                                  </Tooltip>
                                  {t.dueAt && (
                                    <Text size="xs" c={new Date(t.dueAt) < new Date() && t.status !== 'CLOSED' ? 'red' : 'dimmed'}>
                                      {new Date(t.dueAt).toLocaleDateString('id-ID')}
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
