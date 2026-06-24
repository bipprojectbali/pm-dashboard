import { Badge, Card, Group, Stack, Table, Text } from '@mantine/core'
import { TbFileText } from 'react-icons/tb'
import { EmptyRow } from '@/frontend/components/shared/EmptyState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { stickyFirstCell, stickyFirstHeader } from '@/frontend/lib/table-sticky'
import { actionBadge } from './constants'
import type { AuditLogEntry } from './types'

type Props = {
  logs: AuditLogEntry[]
  isLoading: boolean
  actionFilter: string | null
  userFilter: string | null
  windowFilter: string
}

export function AuditLogsTable({ logs, isLoading, actionFilter, userFilter, windowFilter }: Props) {
  const hasFilter = !!(actionFilter || userFilter || windowFilter !== 'all')

  return (
    <Card withBorder radius="md" p={0}>
      <Table.ScrollContainer minWidth={900}>
        <Table highlightOnHover layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={stickyFirstHeader(180)}>Waktu</Table.Th>
              <Table.Th style={{ width: 220 }}>User</Table.Th>
              <Table.Th style={{ width: 160 }}>Action</Table.Th>
              <Table.Th style={{ width: 220 }}>Detail</Table.Th>
              <Table.Th style={{ width: 130 }}>IP</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <EmptyRow icon={TbFileText} title="Memuat audit log..." />
                </Table.Td>
              </Table.Tr>
            )}
            {logs.length === 0 && !isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <EmptyRow
                    icon={TbFileText}
                    title="Belum ada audit log"
                    message={
                      hasFilter
                        ? 'Tidak ada log yang cocok dengan filter. Perluas window atau reset filter.'
                        : 'Audit log akan muncul saat ada aktivitas login, role change, atau block/unblock.'
                    }
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {logs.map((log) => {
              const badge = actionBadge[log.action] ?? { color: 'gray', label: log.action }
              return (
                <Table.Tr key={log.id}>
                  <Table.Td style={stickyFirstCell(180)}>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {new Date(log.createdAt).toLocaleString('id-ID', { hour12: false })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {log.user ? (
                      <Group gap="xs" wrap="nowrap">
                        <UserAvatar
                          name={log.user.name}
                          image={log.user.image}
                          size={24}
                          color="blue"
                          style={{ flexShrink: 0 }}
                        />
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500} truncate>
                            {log.user.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {log.user.email}
                          </Text>
                        </Stack>
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        &mdash;
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={badge.color} variant="light" size="sm">
                      {badge.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {log.detail ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {log.ip ?? '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  )
}
