import { Droppable } from '@hello-pangea/dnd'
import { ActionIcon, Badge, Card, Group, Loader, Pagination, Skeleton, Stack, Text, Tooltip } from '@mantine/core'
import type { Dispatch, SetStateAction } from 'react'
import { TbArrowsMaximize, TbArrowsMinimize, TbChevronLeft, TbChevronRight, TbChecks } from 'react-icons/tb'
import { KANBAN_COL_SIZE, STATUS_COLOR } from './constants'
import { KanbanCard } from './KanbanCard'
import type { TaskListItem, TaskStatus } from './types'

export function KanbanColumn({
  col,
  items,
  total,
  isLoading,
  isFetching,
  currentPage,
  totalPages,
  isHidden,
  isMax,
  isDropDisabled,
  selectMode,
  selectedIds,
  setSelectedIds,
  canWrite,
  onSelect,
  onDeleteOne,
  canDeleteTask,
  onToggleHidden,
  onToggleMax,
  onPageChange,
}: {
  col: { status: TaskStatus; label: string }
  items: TaskListItem[]
  total: number
  isLoading: boolean
  isFetching: boolean
  currentPage: number
  totalPages: number
  isHidden: boolean
  isMax: boolean
  isDropDisabled: boolean
  selectMode: boolean
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  canWrite: boolean
  onSelect: (id: string) => void
  onDeleteOne?: (task: TaskListItem) => void
  canDeleteTask?: (task: TaskListItem) => boolean
  onToggleHidden: () => void
  onToggleMax: () => void
  onPageChange: (page: number) => void
}) {
  const colIds = items.map((t) => t.id)
  const colAllSelected = colIds.length > 0 && colIds.every((id) => selectedIds.has(id))

  return (
    <Card key={col.status} withBorder padding="xs" radius="md" style={{ minHeight: isHidden ? 0 : 240 }}>
      {isHidden ? (
        <Stack align="center" gap={4}>
          <Text size="xs" fw={700} c="dimmed">{total || items.length}</Text>
          <Tooltip label={`Tampilkan ${col.label}`} position="right">
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={onToggleHidden}>
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
            <Text size="xs" c="dimmed">{total > 0 ? total : items.length}</Text>
            {isFetching && <Loader size={10} color="gray" />}
          </Group>
          <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
            {selectMode && items.length > 0 && (
              <Tooltip label={colAllSelected ? 'Batal pilih kolom ini' : `Pilih semua ${items.length} task`}>
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
            )}
            <Tooltip label={isMax ? 'Perkecil kolom' : 'Perbesar kolom'}>
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={onToggleMax}>
                {isMax ? <TbArrowsMinimize size={12} /> : <TbArrowsMaximize size={12} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Ciutkan kolom">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={onToggleHidden}>
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
                    snapshot.isDraggingOver && !isDropDisabled ? 'var(--mantine-color-blue-light)' : undefined,
                  borderRadius: 'var(--mantine-radius-md)',
                  transition: 'background 120ms ease',
                }}
              >
                {isLoading && (
                  <Stack gap={6} py={4}>
                    {[0, 1, 2].map((i) => <Skeleton key={i} h={60} radius="sm" />)}
                  </Stack>
                )}
                {!isLoading && items.length === 0 && !snapshot.isDraggingOver && (
                  <Text size="xs" c="dimmed" ta="center" py="md">No tasks</Text>
                )}
                {items.map((t, idx) => (
                  <KanbanCard
                    key={t.id}
                    t={t}
                    idx={idx}
                    isSelected={selectedIds.has(t.id)}
                    multiDragSize={selectedIds.size}
                    selectMode={selectMode}
                    canWrite={canWrite}
                    onSelect={onSelect}
                    onToggleSelect={(id) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        next.has(id) ? next.delete(id) : next.add(id)
                        return next
                      })
                    }
                    onDeleteOne={onDeleteOne}
                    canDeleteTask={canDeleteTask}
                  />
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
                onChange={onPageChange}
              />
            </Group>
          )}
        </>
      )}
    </Card>
  )
}
