import { Badge, Card, Group, Paper, Stack, Table, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbCircleCheck, TbMessage, TbPaperclip } from 'react-icons/tb'
import { type Ticket, priorityBadge, statusBadge } from './types'

export function TicketsTable({
  tickets,
  loading,
  onOpen,
  emptyHint,
}: {
  tickets: Ticket[]
  loading: boolean
  onOpen: (id: string) => void
  emptyHint: string
}) {
  if (loading) {
    return (
      <Paper withBorder p="lg" radius="md">
        <Text c="dimmed" ta="center">Memuat tickets…</Text>
      </Paper>
    )
  }
  if (tickets.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <ThemeIcon size={40} radius="xl" color="gray" variant="light">
            <TbCircleCheck size={22} />
          </ThemeIcon>
          <Text c="dimmed" ta="center">{emptyHint}</Text>
        </Stack>
      </Paper>
    )
  }
  return (
    <Card withBorder radius="md" p={0}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Reporter</Table.Th>
            <Table.Th>Assignee</Table.Th>
            <Table.Th>Activity</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tickets.map((t) => {
            const pb = priorityBadge[t.priority] ?? priorityBadge.MEDIUM
            const sb = statusBadge[t.status] ?? statusBadge.OPEN
            return (
              <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(t.id)}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text size="sm" fw={500} lineClamp={1}>{t.title}</Text>
                    {t.route && <Text size="xs" c="dimmed" lineClamp={1}>{t.route}</Text>}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge color={pb.color} variant="light" size="sm">{pb.label}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={sb.color} variant="light" size="sm">{sb.label}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{t.reporter?.name ?? '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{t.assignee?.name ?? '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="Comments">
                      <Group gap={4}><TbMessage size={12} /><Text size="xs">{t._count.comments}</Text></Group>
                    </Tooltip>
                    <Tooltip label="Evidence">
                      <Group gap={4}><TbPaperclip size={12} /><Text size="xs">{t._count.evidence}</Text></Group>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

