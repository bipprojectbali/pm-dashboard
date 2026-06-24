import { Badge, Card, Group, Pagination, Table, Text, Tooltip } from '@mantine/core'
import { TbBan, TbListCheck, TbSearch } from 'react-icons/tb'
import { EmptyRow } from '@/frontend/components/shared/EmptyState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { stickyFirstCell, stickyFirstHeader } from '@/frontend/lib/table-sticky'
import {
  KIND_COLOR,
  PAGE_SIZE,
  PRIORITY_COLOR,
  STATUS_COLOR,
  formatAge,
  formatDate,
  isOverdue,
  isStale,
  type TriageTask,
} from './types'

type Props = {
  pagedTasks: TriageTask[]
  isLoading: boolean
  filteredCount: number
  page: number
  onPageChange: (p: number) => void
  onTaskClick: (t: TriageTask) => void
}

export function TriageTable({ pagedTasks, isLoading, filteredCount, page, onPageChange, onTaskClick }: Props) {
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  return (
    <Card withBorder padding={0} radius="md">
      <Table.ScrollContainer minWidth={1100}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={stickyFirstHeader(260)}>Task</Table.Th>
              <Table.Th style={{ width: 160 }}>Project</Table.Th>
              <Table.Th style={{ width: 130 }}>Status</Table.Th>
              <Table.Th style={{ width: 110 }}>Priority</Table.Th>
              <Table.Th style={{ width: 160 }}>Assignee</Table.Th>
              <Table.Th style={{ width: 130 }}>
                <Tooltip label="Deadline task (dueAt). Merah = sudah lewat hari ini.">
                  <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Due</span>
                </Tooltip>
              </Table.Th>
              <Table.Th style={{ width: 110 }}>
                <Tooltip label="Berapa hari sejak task terakhir diupdate (updatedAt). Kuning = >7 hari tidak bergerak.">
                  <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>Age</span>
                </Tooltip>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <EmptyRow icon={TbListCheck} title="Memuat task..." />
                </Table.Td>
              </Table.Tr>
            )}
            {!isLoading && filteredCount === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <EmptyRow
                    icon={TbSearch}
                    title="Tidak ada task yang cocok"
                    message="Coba ubah filter atau reset pencarian."
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {pagedTasks.map((t) => {
              const overdue = isOverdue(t)
              const stale = isStale(t)
              return (
                <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onTaskClick(t)}>
                  <Table.Td style={stickyFirstCell(260)}>
                    <Group gap="xs" wrap="nowrap">
                      <Badge color={KIND_COLOR[t.kind]} variant="dot" size="xs">
                        {t.kind}
                      </Badge>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {t.title}
                      </Text>
                      {t._count.blockedBy > 0 && (
                        <Tooltip
                          multiline
                          w={240}
                          label={`Task ini tergantung pada ${t._count.blockedBy} task lain yang belum selesai (TaskDependency). Baru bisa lanjut setelah semua blocker ditutup.`}
                        >
                          <Badge color="grape" variant="light" size="xs" leftSection={<TbBan size={10} />}>
                            {t._count.blockedBy}
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {t.project.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[t.status]} variant="light" size="sm">
                      {t.status.replace('_', ' ')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={PRIORITY_COLOR[t.priority]} variant="dot" size="sm">
                      {t.priority}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {t.assignee ? (
                      <Tooltip label={t.assignee.email} withArrow>
                        <Group gap={6} wrap="nowrap">
                          <UserAvatar name={t.assignee.name} image={t.assignee.image} size={20} color="blue" />
                          <Text size="xs" truncate style={{ maxWidth: 80 }}>
                            {t.assignee.name.split(' ')[0]}
                          </Text>
                        </Group>
                      </Tooltip>
                    ) : (
                      <Badge color="orange" variant="light" size="xs">
                        Unassigned
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                      {formatDate(t.dueAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c={stale ? 'yellow.7' : 'dimmed'} fw={stale ? 600 : undefined}>
                      {formatAge(t.updatedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {filteredCount > PAGE_SIZE && (
        <Group justify="space-between" p="md">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(safePage * PAGE_SIZE, filteredCount)} dari {filteredCount}
          </Text>
          <Pagination value={safePage} onChange={onPageChange} total={totalPages} size="sm" />
        </Group>
      )}
    </Card>
  )
}
