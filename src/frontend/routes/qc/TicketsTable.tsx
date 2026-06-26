import { Badge, Card, Checkbox, Group, Paper, Stack, Table, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core'
import { TbArrowsSort, TbCircleCheck, TbMessage, TbPaperclip, TbSortAscending, TbSortDescending } from 'react-icons/tb'
import type { SortField, SortOrder } from '../qc'
import { type Ticket, priorityBadge, statusBadge } from './types'

export function TicketsTable({
  tickets,
  loading,
  onOpen,
  emptyHint,
  selectedIds,
  onToggle,
  onToggleAll,
  sort,
  order,
  onSort,
}: {
  tickets: Ticket[]
  loading: boolean
  onOpen: (id: string) => void
  emptyHint: string
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
  sort?: SortField
  order?: SortOrder
  onSort: (field: SortField) => void
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

  const allIds = tickets.map((t) => t.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someSelected = allIds.some((id) => selectedIds.has(id)) && !allSelected

  const SortTh = ({ field, label }: { field: SortField; label: string }) => {
    const active = sort === field
    const Icon = active ? (order === 'asc' ? TbSortAscending : TbSortDescending) : TbArrowsSort
    return (
      <Table.Th>
        <UnstyledButton onClick={() => onSort(field)} aria-label={`Sort by ${label}`}>
          <Group gap={4} wrap="nowrap">
            <Text size="sm" fw={500} c={active ? undefined : 'inherit'}>{label}</Text>
            <Icon size={13} opacity={active ? 1 : 0.4} />
          </Group>
        </UnstyledButton>
      </Table.Th>
    )
  }

  return (
    <Card withBorder radius="md" p={0}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={36}>
              <Checkbox
                size="xs"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => onToggleAll(allIds)}
              />
            </Table.Th>
            <SortTh field="title" label="Title" />
            <SortTh field="priority" label="Priority" />
            <Table.Th>Status</Table.Th>
            <Table.Th>Reporter</Table.Th>
            <Table.Th>Assignee</Table.Th>
            <SortTh field="created" label="Tanggal" />
            <Table.Th>Activity</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tickets.map((t) => {
            const pb = priorityBadge[t.priority] ?? priorityBadge.MEDIUM
            const sb = statusBadge[t.status] ?? statusBadge.OPEN
            const checked = selectedIds.has(t.id)
            return (
              <Table.Tr
                key={t.id}
                style={{ cursor: 'pointer' }}
                bg={checked ? 'var(--mantine-color-blue-light)' : undefined}
                onClick={() => onOpen(t.id)}
              >
                <Table.Td onClick={(e) => { e.stopPropagation(); onToggle(t.id) }}>
                  <Checkbox size="xs" checked={checked} onChange={() => onToggle(t.id)} />
                </Table.Td>
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
                  <Tooltip label={new Date(t.createdAt).toLocaleString('id-ID')}>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(t.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </Tooltip>
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
