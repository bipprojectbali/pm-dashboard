import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Tooltip,
  ThemeIcon,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbArrowsMaximize,
  TbArrowsMinimize,
  TbCheck,
  TbChecks,
  TbChevronLeft,
  TbChevronRight,
  TbX,
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
const API_CEIL = 500

export function TasksKanbanView({
  tasks,
  canWrite,
  onSelect,
  totalFetched,
  filterKey,
}: {
  tasks: TaskListItem[]
  canWrite: boolean
  onSelect: (id: string) => void
  totalFetched?: number
  filterKey?: string
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

  // Per-column current page (0-indexed).
  // Reset hanya saat filterKey berubah (project/status/search ganti),
  // bukan saat drag-drop — safePage clamp handle out-of-range otomatis.
  const [colPage, setColPage] = useState<Record<TaskStatus, number>>({
    OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0,
  })
  const prevFilterKeyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (filterKey === undefined || filterKey === prevFilterKeyRef.current) return
    prevFilterKeyRef.current = filterKey
    setColPage({ OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0 })
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [filterKey])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  const exitSelect = () => { setSelectedIds(new Set()); setSelectMode(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelect() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isMaybeTruncated = (totalFetched ?? 0) >= API_CEIL

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

    const allTasks = Object.values(cols).flat()
    const primaryTask = allTasks.find((t) => t.id === draggableId)
    if (!primaryTask) return

    // Multi-drag: dragged card is in selection and selection has >1 task
    const isMulti = selectedIds.has(draggableId) && selectedIds.size > 1
    const tasksToMove = isMulti
      ? allTasks.filter((t) => selectedIds.has(t.id) && kanbanAllowed(t.status, t.kind).includes(dstStatus))
      : [primaryTask]

    const movedIds = new Set(tasksToMove.map((t) => t.id))
    // Track original statuses before mutation so we know which columns were affected
    const originalStatusOf = new Map(tasksToMove.map((t) => [t.id, t.status]))

    let newCols: Record<TaskStatus, TaskListItem[]> | null = null
    setCols((prev) => {
      const next: Record<TaskStatus, TaskListItem[]> = {
        OPEN: [...prev.OPEN],
        IN_PROGRESS: [...prev.IN_PROGRESS],
        READY_FOR_QC: [...prev.READY_FOR_QC],
        REOPENED: [...prev.REOPENED],
        CLOSED: [...prev.CLOSED],
      }

      if (!isMulti) {
        // Original single-task logic — unchanged
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
      } else {
        // Multi-drag: pull all selected tasks out of their current columns first
        for (const status of Object.keys(next) as TaskStatus[]) {
          next[status] = next[status].filter((t) => !movedIds.has(t.id))
        }
        // Insert at drop index: primary card first, then the rest in original order
        const others = tasksToMove.filter((t) => t.id !== draggableId)
        next[dstStatus].splice(
          destination.index, 0,
          { ...primaryTask, status: dstStatus },
          ...others.map((t) => ({ ...t, status: dstStatus })),
        )
      }

      newCols = next
      return next
    })

    if (isMulti) setSelectedIds(new Set())

    setTimeout(() => {
      if (!newCols) return
      const updates: Array<{ id: string; kanbanOrder: number; status?: string }> = []
      const affectedStatuses = isMulti
        ? new Set<TaskStatus>([...(originalStatusOf.values() as unknown as TaskStatus[]), dstStatus])
        : new Set<TaskStatus>(srcStatus === dstStatus ? [srcStatus] : [srcStatus, dstStatus])

      for (const status of affectedStatuses) {
        newCols[status].forEach((t, idx) => {
          updates.push({
            id: t.id,
            kanbanOrder: idx,
            ...(movedIds.has(t.id) && originalStatusOf.get(t.id) !== dstStatus ? { status: dstStatus } : {}),
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
  }, [qc, cols, selectedIds])

  const gridCols = KANBAN_COLUMNS.map((col) =>
    colHidden[col.status] ? '44px' : colMax[col.status] ? 'minmax(360px, 2fr)' : 'minmax(240px, 1fr)'
  ).join(' ')

  const allTaskIds = Object.values(cols).flat().map((t) => t.id)
  const allSelected = allTaskIds.length > 0 && allTaskIds.every((id) => selectedIds.has(id))

  return (
    <>
    <Group mb={8} justify="space-between" align="center">
      {/* Kiri: info pilihan (hanya muncul saat ada pilihan atau selectMode aktif) */}
      <Group gap={6} align="center">
        {(selectMode || selectedIds.size > 0) ? (
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
            <Button size="compact-xs" variant="subtle" color="gray" onClick={exitSelect}>
              Keluar
            </Button>
          </>
        ) : (
          <Text size="xs" c="dimmed">Ctrl+klik atau aktifkan Select untuk pilih banyak</Text>
        )}
      </Group>

      {/* Kanan: tombol masuk/keluar select mode */}
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
    <DragDropContext
      onDragStart={(initial) => setDraggingTaskId(initial.draggableId)}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, overflowX: 'auto' }}>
        {KANBAN_COLUMNS.map((col) => {
          const items = cols[col.status]
          const page = colPage[col.status]
          const totalPages = Math.max(1, Math.ceil(items.length / KANBAN_PAGE))
          const safePage = Math.min(page, totalPages - 1)
          const visible = items.slice(safePage * KANBAN_PAGE, (safePage + 1) * KANBAN_PAGE)
          const rangeStart = safePage * KANBAN_PAGE + 1
          const rangeEnd = Math.min((safePage + 1) * KANBAN_PAGE, items.length)
          const isHidden = !!colHidden[col.status]
          const colMaybeTruncated = isMaybeTruncated && col.status === Object.entries(cols).sort((a, b) => b[1].length - a[1].length)[0]?.[0]
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
              style={{
                minHeight: isHidden ? 0 : 240,
              }}
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
                    {colMaybeTruncated && (
                      <Tooltip label="Data mungkin terpotong — batas 500 task tercapai. Gunakan filter untuk mempersempit." withArrow>
                        <ThemeIcon size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>
                          <TbAlertTriangle size={10} />
                        </ThemeIcon>
                      </Tooltip>
                    )}
                  </Group>
                  <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                    {selectMode && items.length > 0 && (() => {
                      const colIds = items.map((t) => t.id)
                      const colAllSelected = colIds.every((id) => selectedIds.has(id))
                      return (
                        <Tooltip label={colAllSelected ? 'Batal pilih kolom ini' : `Pilih semua ${items.length} task`}>
                          <ActionIcon
                            size="xs"
                            variant={colAllSelected ? 'filled' : 'light'}
                            color="blue"
                            onClick={() =>
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                if (colAllSelected) colIds.forEach((id) => next.delete(id))
                                else colIds.forEach((id) => next.add(id))
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

              {/* Cards */}
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
                        background: snapshot.isDraggingOver && !isDropDisabled
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                        borderRadius: 'var(--mantine-radius-md)',
                        transition: 'background 120ms ease',
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
                                boxShadow: dragSnapshot.isDragging
                                  ? '0 8px 24px rgba(0,0,0,0.18)'
                                  : undefined,
                                ...dragProvided.draggableProps.style,
                                flexShrink: 0,
                              }}
                            >
                              {/* Checkbox indicator — muncul saat select mode aktif */}
                              {selectMode && !dragSnapshot.isDragging && (
                                <div style={{
                                  position: 'absolute', top: 6, right: 6, zIndex: 5,
                                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                  border: `2px solid ${isSelected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-4)'}`,
                                  background: isSelected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-body)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  pointerEvents: 'none',
                                }}>
                                  {isSelected && <TbCheck size={10} color="#fff" />}
                                </div>
                              )}

                              {dragSnapshot.isDragging ? (
                                /* Drag preview — hanya tampilkan jumlah + asal */
                                <Stack align="center" justify="center" gap={2} style={{ minHeight: 72 }}>
                                  <Text fw={900} style={{ fontSize: 40, lineHeight: 1, color: 'var(--mantine-color-blue-6)' }}>
                                    {isMultiDrag ? selectedIds.size : 1}
                                  </Text>
                                  <Text size="xs" fw={600} c="dimmed">
                                    {(isMultiDrag ? selectedIds.size : 1) === 1 ? 'task' : 'tasks'}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    dari <b>{KANBAN_COLUMNS.find((c) => c.status === t.status)?.label ?? t.status}</b>
                                  </Text>
                                </Stack>
                              ) : (
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
                              )}
                            </Card>
                          )}}
                        </Draggable>
                      ))}

                      {/* Required by @hello-pangea/dnd — reserves space for dragged item */}
                      {provided.placeholder}
                    </Stack>
                  )}
                </Droppable>

                {totalPages > 1 && (
                  <Group
                    justify="space-between"
                    align="center"
                    pt={6}
                    mt={4}
                    style={{ borderTop: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
                  >
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      disabled={safePage === 0}
                      onClick={() => setColPage((p) => ({ ...p, [col.status]: safePage - 1 }))}
                    >
                      <TbChevronLeft size={12} />
                    </ActionIcon>
                    <Text size="xs" c="dimmed">
                      {rangeStart}–{rangeEnd} / {items.length}
                    </Text>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setColPage((p) => ({ ...p, [col.status]: safePage + 1 }))}
                    >
                      <TbChevronRight size={12} />
                    </ActionIcon>
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
