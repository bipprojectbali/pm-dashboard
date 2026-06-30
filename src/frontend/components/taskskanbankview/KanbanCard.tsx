import { Draggable } from '@hello-pangea/dnd'
import { ActionIcon, Badge, Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import type { MouseEvent } from 'react'
import { TbCheck, TbListCheck, TbLock, TbMessage, TbPaperclip, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { KIND_COLOR, KANBAN_COLUMNS, PRIORITY_COLOR } from './constants'
import type { TaskListItem } from './types'

export function KanbanCard({
  t,
  idx,
  isSelected,
  multiDragSize,
  selectMode,
  canWrite,
  onSelect,
  onToggleSelect,
  onDeleteOne,
  canDeleteTask,
}: {
  t: TaskListItem
  idx: number
  isSelected: boolean
  multiDragSize: number
  selectMode: boolean
  canWrite: boolean
  onSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onDeleteOne?: (task: TaskListItem) => void
  canDeleteTask?: (task: TaskListItem) => boolean
}) {
  return (
    <Draggable key={t.id} draggableId={t.id} index={idx} isDragDisabled={!canWrite}>
      {(dragProvided, dragSnapshot) => {
        const isMultiDrag = dragSnapshot.isDragging && isSelected && multiDragSize > 1
        return (
          <Card
            withBorder
            padding="xs"
            radius="sm"
            ref={dragProvided.innerRef}
            {...dragProvided.draggableProps}
            {...dragProvided.dragHandleProps}
            onClick={(e: MouseEvent) => {
              if (dragSnapshot.isDragging) return
              if (selectMode || e.ctrlKey || e.metaKey) {
                e.preventDefault()
                e.stopPropagation()
                onToggleSelect(t.id)
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
                  background: isSelected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-body)',
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
                <Text fw={900} style={{ fontSize: 40, lineHeight: 1, color: 'var(--mantine-color-blue-6)' }}>
                  {isMultiDrag ? multiDragSize : 1}
                </Text>
                <Text size="xs" fw={600} c="dimmed">
                  {(isMultiDrag ? multiDragSize : 1) === 1 ? 'task' : 'tasks'}
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
                    <div
                      style={{
                        width: `${t.progressPercent}%`,
                        height: '100%',
                        background: t.status === 'CLOSED' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)',
                      }}
                    />
                  </div>
                )}
                <Group gap={10} wrap="nowrap" c="dimmed">
                  <Tooltip label="Checklist selesai" withArrow position="bottom">
                    <Group gap={2} wrap="nowrap">
                      <TbListCheck size={13} />
                      <Text size="xs">
                        {t.checklist.filter((c) => c.done).length}/{t.checklist.length}
                      </Text>
                    </Group>
                  </Tooltip>
                  <Tooltip label="Komentar" withArrow position="bottom">
                    <Group gap={2} wrap="nowrap">
                      <TbMessage size={13} />
                      <Text size="xs">{t._count.comments}</Text>
                    </Group>
                  </Tooltip>
                  <Tooltip label="Evidence / file" withArrow position="bottom">
                    <Group gap={2} wrap="nowrap">
                      <TbPaperclip size={13} />
                      <Text size="xs">{t._count.evidence}</Text>
                    </Group>
                  </Tooltip>
                  <Tooltip label="Diblok oleh (dependencies)" withArrow position="bottom">
                    <Group gap={2} wrap="nowrap" c={t._count.blockedBy > 0 ? 'orange' : undefined}>
                      <TbLock size={13} />
                      <Text size="xs">{t._count.blockedBy}</Text>
                    </Group>
                  </Tooltip>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Tooltip label={t.assignee ? t.assignee.name : 'Unassigned'} withArrow position="bottom">
                    <Group gap={4} wrap="nowrap">
                      <UserAvatar name={t.assignee?.name} image={t.assignee?.image} size={18} color="blue" />
                      <Text size="xs" c="dimmed" truncate>
                        {t.assignee ? t.assignee.name.split(' ')[0] : 'Unassigned'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <Group gap={4} wrap="nowrap">
                    {t.dueAt && (
                      <Text size="xs" c={new Date(t.dueAt) < new Date() && t.status !== 'CLOSED' ? 'red' : 'dimmed'}>
                        {new Date(t.dueAt).toLocaleDateString('id-ID')}
                      </Text>
                    )}
                    {selectMode && onDeleteOne && (!canDeleteTask || canDeleteTask(t)) && (
                      <Tooltip label="Hapus task" withArrow position="top">
                        <ActionIcon size="xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDeleteOne(t) }}>
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
  )
}
