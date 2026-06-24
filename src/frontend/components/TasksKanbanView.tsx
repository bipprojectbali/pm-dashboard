import { DragDropContext } from '@hello-pangea/dnd'
import { Badge, Button, Group, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { TbChecks, TbTrash } from 'react-icons/tb'
import { KanbanColumn } from './taskskanbankview/KanbanColumn'
import { KANBAN_COL_SIZE, KANBAN_COLUMNS, buildColParams } from './taskskanbankview/constants'
import type { KanbanFilters, TaskListItem, TaskStatus } from './taskskanbankview/types'
import { useKanbanDnd } from './taskskanbankview/useKanbanDnd'

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
    OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [colHidden, setColHidden] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-hidden', defaultValue: {},
  })
  const [colMax, setColMax] = useLocalStorage<Partial<Record<TaskStatus, boolean>>>({
    key: 'pm:kanban:col-max', defaultValue: {},
  })

  const mkQ = (status: TaskStatus, offset: number) => useQuery({ // eslint-disable-line react-hooks/rules-of-hooks
    queryKey: ['tasks-kanban', status, projectId, filters, offset],
    queryFn: () => fetch(`/api/tasks?${buildColParams(status, offset, projectId, filters)}`, { credentials: 'include' })
      .then((r) => r.json()) as Promise<{ tasks: TaskListItem[]; total: number }>,
    staleTime: 30_000,
  })

  const openQ = mkQ('OPEN', colOffset.OPEN)
  const inProgQ = mkQ('IN_PROGRESS', colOffset.IN_PROGRESS)
  const readyQ = mkQ('READY_FOR_QC', colOffset.READY_FOR_QC)
  const reopenedQ = mkQ('REOPENED', colOffset.REOPENED)
  const closedQ = mkQ('CLOSED', colOffset.CLOSED)

  const COL_QUERIES = {
    OPEN: openQ, IN_PROGRESS: inProgQ, READY_FOR_QC: readyQ, REOPENED: reopenedQ, CLOSED: closedQ,
  } as const

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on filter identity
  useEffect(() => {
    setColOffset({ OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0 })
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [projectId, filters.kind, filters.mine, filters.tagId, filters.search, filters.priority])

  const exitSelect = useCallback(() => { setSelectedIds(new Set()); setSelectMode(false) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelect() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitSelect])

  const { draggingTask, allowedTargets, allVisibleTasks, onDragStart, onDragEnd } = useKanbanDnd({
    selectedIds, setSelectedIds, colOffset, projectId, filters, qc, colQueries: COL_QUERIES,
  })

  const allTaskIds = allVisibleTasks.map((t) => t.id)
  const allSelected = allTaskIds.length > 0 && allTaskIds.every((id) => selectedIds.has(id))
  const deletableSelectedIds = Array.from(selectedIds).filter((id) => {
    const t = allVisibleTasks.find((x) => x.id === id)
    return t && canDeleteTask ? canDeleteTask(t) : !!t
  })
  const gridCols = KANBAN_COLUMNS.map((col) =>
    colHidden[col.status] ? '44px' : colMax[col.status] ? 'minmax(360px, 2fr)' : 'minmax(240px, 1fr)',
  ).join(' ')

  return (
    <>
      <Group mb={8} justify="space-between" align="center">
        <Group gap={6} align="center">
          {selectMode || selectedIds.size > 0 ? (
            <>
              <Badge size="sm" color="blue" variant="light" style={{ flexShrink: 0 }}>
                {selectedIds.size} dipilih
              </Badge>
              <Button size="compact-xs" variant="subtle" color="blue"
                onClick={() => {
                  if (allSelected) setSelectedIds(new Set())
                  else setSelectedIds(new Set(allTaskIds))
                }}
              >
                {allSelected ? 'Batal semua' : `Pilih semua (${allTaskIds.length})`}
              </Button>
              {selectedIds.size > 0 && (
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>· drag ke kolom tujuan</Text>
              )}
              {selectedIds.size > 0 && onDeleteSelected && deletableSelectedIds.length > 0 && (
                <Button size="compact-xs" variant="light" color="red" leftSection={<TbTrash size={11} />}
                  onClick={() => onDeleteSelected(deletableSelectedIds)}
                >
                  Hapus terpilih ({deletableSelectedIds.length})
                </Button>
              )}
              <Button size="compact-xs" variant="subtle" color="gray" onClick={exitSelect}>Keluar</Button>
            </>
          ) : (
            <Text size="xs" c="dimmed">Ctrl+klik atau aktifkan Select untuk pilih banyak</Text>
          )}
        </Group>
        <Button
          size="compact-xs"
          variant={selectMode ? 'filled' : 'light'}
          color={selectMode ? 'blue' : 'gray'}
          leftSection={<TbChecks size={12} />}
          onClick={() => { if (selectMode) exitSelect(); else setSelectMode(true) }}
        >
          {selectMode ? 'Select ON' : 'Select'}
        </Button>
      </Group>

      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, overflowX: 'auto' }}>
          {KANBAN_COLUMNS.map((col) => {
            const colData = COL_QUERIES[col.status]
            const items = colData.data?.tasks ?? []
            const total = colData.data?.total ?? 0
            const totalPages = Math.max(1, Math.ceil(total / KANBAN_COL_SIZE))
            const currentPage = Math.floor(colOffset[col.status] / KANBAN_COL_SIZE) + 1
            const isDropDisabled =
              !canWrite ||
              !!colHidden[col.status] ||
              (draggingTask != null && draggingTask.status !== col.status && !allowedTargets.includes(col.status))

            return (
              <KanbanColumn
                key={col.status}
                col={col}
                items={items}
                total={total}
                isLoading={colData.isLoading}
                isFetching={colData.isFetching && !colData.isLoading}
                currentPage={currentPage}
                totalPages={totalPages}
                isHidden={!!colHidden[col.status]}
                isMax={!!colMax[col.status]}
                isDropDisabled={isDropDisabled}
                selectMode={selectMode}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                canWrite={canWrite}
                onSelect={onSelect}
                onDeleteOne={onDeleteOne}
                canDeleteTask={canDeleteTask}
                onToggleHidden={() => setColHidden((p) => ({ ...p, [col.status]: !p[col.status] }))}
                onToggleMax={() => setColMax((p) => ({ ...p, [col.status]: !p[col.status] }))}
                onPageChange={(page) => setColOffset((p) => ({ ...p, [col.status]: (page - 1) * KANBAN_COL_SIZE }))}
              />
            )
          })}
        </div>
      </DragDropContext>
    </>
  )
}
