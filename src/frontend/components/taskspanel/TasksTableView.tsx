import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Pagination,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core'
import { TbClock, TbTrash } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { KIND_COLOR, PRIORITY_COLOR, STATUS_COLOR, STICKY_COL_CELL, STICKY_COL_HEADER } from './constants'
import type { TaskListItem } from './types'

export function TasksTableView({
  tasks,
  activeProject,
  total,
  page,
  setPage,
  safePage,
  totalPages,
  PAGE_SIZE,
  selectedIds,
  toggleSelection,
  toggleAllSelection,
  clearSelection,
  allDeletableSelected,
  someDeletableSelected,
  deletableTasks,
  deletableSelected,
  deleteBulkPending,
  deleteOnePending,
  deleteOneId,
  onDeleteOne,
  onDeleteSelected,
  canDeleteTask,
  onOpen,
}: {
  tasks: TaskListItem[]
  activeProject: { id: string; name: string } | null
  total: number
  page: number
  setPage: (p: number) => void
  safePage: number
  totalPages: number
  PAGE_SIZE: number
  selectedIds: Set<string>
  toggleSelection: (id: string) => void
  toggleAllSelection: () => void
  clearSelection: () => void
  allDeletableSelected: boolean
  someDeletableSelected: boolean
  deletableTasks: TaskListItem[]
  deletableSelected: string[]
  deleteBulkPending: boolean
  deleteOnePending: boolean
  deleteOneId: string | undefined
  onDeleteOne: (t: TaskListItem) => void
  onDeleteSelected: () => void
  canDeleteTask: (t: TaskListItem) => boolean
  onOpen: (id: string) => void
}) {
  return (
    <Card withBorder padding={0} radius="md">
      {deletableSelected.length > 0 && (
        <Group
          justify="space-between"
          px="md"
          py="xs"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
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
            disabled={deleteBulkPending}
            loading={deleteBulkPending}
            onClick={onDeleteSelected}
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
              {activeProject ? <Table.Th style={{ width: 110 }}>Fase</Table.Th> : null}
              <Table.Th style={{ width: 110 }}>Due</Table.Th>
              <Table.Th style={{ width: 90 }}>Hours</Table.Th>
              <Table.Th style={{ width: 110 }}>Progress</Table.Th>
              <Table.Th style={{ width: 110 }}>Updated</Table.Th>
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.map((t) => {
              const variance =
                t.estimateHours != null && t.actualHours != null ? t.actualHours - t.estimateHours : null
              const blocked = t._count.blockedBy > 0 && t.status !== 'CLOSED'
              const deletable = canDeleteTask(t)
              const checked = selectedIds.has(t.id)
              return (
                <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(t.id)}>
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
                        <Text size="sm" fw={500} lineClamp={1}>{t.title}</Text>
                        {blocked && (
                          <Tooltip label={`Blocked by ${t._count.blockedBy} task(s)`}>
                            <Badge size="xs" color="gray" variant="filled">blocked</Badge>
                          </Tooltip>
                        )}
                      </Group>
                      {t.tags.length > 0 && (
                        <Group gap={4} wrap="wrap">
                          {t.tags.slice(0, 4).map((tt) => (
                            <Badge key={tt.tagId} size="xs" color={tt.tag.color} variant="light">{tt.tag.name}</Badge>
                          ))}
                          {t.tags.length > 4 && <Text size="xs" c="dimmed">+{t.tags.length - 4}</Text>}
                        </Group>
                      )}
                    </Stack>
                  </Table.Td>
                  {activeProject ? null : (
                    <Table.Td><Text size="xs" c="dimmed">{t.project.name}</Text></Table.Td>
                  )}
                  <Table.Td>
                    <Badge color={KIND_COLOR[t.kind]} variant="light" size="sm">{t.kind}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[t.status]} variant="light" size="sm">{t.status.replace('_', ' ')}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={PRIORITY_COLOR[t.priority]} variant="dot" size="sm">{t.priority}</Badge>
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
                  {activeProject ? (
                    <Table.Td>
                      {t.phase ? (
                        <Badge size="xs" variant="light" color="indigo">{t.phase.title}</Badge>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                  ) : null}
                  <Table.Td>
                    {t.dueAt ? (() => {
                      const dueMs = new Date(t.dueAt).getTime()
                      const overdue = t.status !== 'CLOSED' && dueMs < Date.now()
                      return (
                        <Text size="xs" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                          {new Date(t.dueAt).toLocaleDateString('id-ID')}
                        </Text>
                      )
                    })() : <Text size="xs" c="dimmed">—</Text>}
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
                        <Text size="xs" c="dimmed">{t.progressPercent}%</Text>
                        <Progress value={t.progressPercent} size="xs" color={t.status === 'CLOSED' ? 'green' : 'blue'} />
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{new Date(t.updatedAt).toLocaleDateString()}</Text>
                  </Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    {deletable && (
                      <Tooltip label="Hapus task">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={`Hapus task ${t.title}`}
                          onClick={() => onDeleteOne(t)}
                          loading={deleteOnePending && deleteOneId === t.id}
                        >
                          <TbTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {total > PAGE_SIZE && (
        <Group justify="space-between" p="md">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} dari {total}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Card>
  )
}
