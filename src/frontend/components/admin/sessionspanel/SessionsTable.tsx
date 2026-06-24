import { Badge, Group, Pagination, Stack, Table, Text, Tooltip } from '@mantine/core'
import { TbDevices, TbSearch } from 'react-icons/tb'
import { EmptyRow } from '@/frontend/components/shared/EmptyState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { stickyFirstCell, stickyFirstHeader } from '@/frontend/lib/table-sticky'
import { ROLE_COLOR, formatDateTime, formatRelative, PAGE_SIZE } from './types'
import type { SessionRow } from './types'

type Props = {
  sessions: SessionRow[]
  isLoading: boolean
  totalFiltered: number
  safePage: number
  totalPages: number
  setPage: (p: number) => void
}

export function SessionsTable({ sessions, isLoading, totalFiltered, safePage, totalPages, setPage }: Props) {
  return (
    <div>
      <Table.ScrollContainer minWidth={850}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={stickyFirstHeader(240)}>User</Table.Th>
              <Table.Th style={{ width: 130 }}>Role</Table.Th>
              <Table.Th style={{ width: 160 }}>Status</Table.Th>
              <Table.Th style={{ width: 160 }}>Started</Table.Th>
              <Table.Th style={{ width: 160 }}>Expires</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <EmptyRow icon={TbDevices} title="Memuat session…" />
                </Table.Td>
              </Table.Tr>
            )}
            {!isLoading && sessions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <EmptyRow
                    icon={TbSearch}
                    title="Tidak ada session yang cocok"
                    message="Coba ubah filter atau reset pencarian."
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {sessions.map((s) => (
              <Table.Tr key={s.id} opacity={s.isExpired ? 0.5 : 1}>
                <Table.Td style={stickyFirstCell(240)}>
                  <Group gap="xs" wrap="nowrap">
                    <UserAvatar
                      name={s.userName}
                      image={s.userImage}
                      size={26}
                      color="blue"
                      style={{ flexShrink: 0 }}
                    />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {s.userName}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {s.userEmail}
                      </Text>
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color={ROLE_COLOR[s.userRole] ?? 'gray'} variant="light" size="sm">
                    {s.userRole}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    {s.userBlocked && (
                      <Badge color="red" variant="filled" size="xs">
                        Blocked
                      </Badge>
                    )}
                    {s.isExpired ? (
                      <Badge color="gray" variant="light" size="xs">
                        Expired
                      </Badge>
                    ) : s.isOnline ? (
                      <Badge color="green" variant="filled" size="xs">
                        Online
                      </Badge>
                    ) : (
                      <Badge color="blue" variant="light" size="xs">
                        Active
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={formatDateTime(s.createdAt)}>
                    <Text size="xs" c="dimmed">
                      {formatRelative(s.createdAt)}
                    </Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={formatDateTime(s.expiresAt)}>
                    <Text size="xs" c={s.isExpired ? 'red' : 'dimmed'}>
                      {formatRelative(s.expiresAt)}
                    </Text>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {totalFiltered > PAGE_SIZE && (
        <Group justify="space-between" p="md">
          <Text size="xs" c="dimmed">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalFiltered)} dari {totalFiltered}
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </div>
  )
}
