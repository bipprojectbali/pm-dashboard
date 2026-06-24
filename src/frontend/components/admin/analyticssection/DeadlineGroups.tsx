import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbCalendarEvent, TbInfoCircle } from 'react-icons/tb'
import { type AnalyticsData, type DeadlineFuture, type DeadlinePast, PRIORITY_BADGE } from './types'

function DeadlineColumn({
  title,
  color,
  rows,
  variant,
}: {
  title: string
  color: string
  rows: Array<DeadlineFuture | DeadlinePast>
  variant: 'future' | 'past'
}) {
  return (
    <Stack gap={6}>
      <Group gap="xs" justify="space-between">
        <Text size="xs" fw={500} tt="uppercase" c={color}>{title}</Text>
        <Badge size="xs" variant="light" color={color}>{rows.length}</Badge>
      </Group>
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">—</Text>
      ) : (
        rows.slice(0, 6).map((p) => {
          const days =
            variant === 'past'
              ? `${(p as DeadlinePast).daysOverdue ?? 0}d past`
              : `${(p as DeadlineFuture).daysUntil ?? 0}d left`
          return (
            <Group key={p.id} gap={4} wrap="nowrap" align="flex-start">
              <Badge size="xs" color={PRIORITY_BADGE[p.priority] ?? 'gray'} variant="outline">
                {p.priority}
              </Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" fw={500} truncate>{p.name}</Text>
                <Text size="xs" c="dimmed" truncate>{p.owner}</Text>
              </div>
              <Text size="xs" c={variant === 'past' ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                {days}
              </Text>
            </Group>
          )
        })
      )}
    </Stack>
  )
}

export function DeadlineGroupsBlock({ groups }: { groups: AnalyticsData['deadlineGroups'] }) {
  const total = groups.endingSoon.length + groups.endingMonth.length + groups.pastDue.length
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="orange" size="md" radius="md">
          <TbCalendarEvent size={16} />
        </ThemeIcon>
        <Title order={5}>Deadline groups</Title>
        <Tooltip multiline w={340} withArrow label="Project dikelompokkan berdasarkan endsAt vs hari ini: Past-due (sudah lewat), Ending <7d (deadline dalam 7 hari), Ending 7–30d (bulan ini). Per kolom tampil 6 project teratas dengan badge priority + sisa/lewat hari.">
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">grouped by endsAt</Text>
      </Group>
      {total === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">Tidak ada project dengan deadline aktif.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
          <DeadlineColumn title="Past-due" color="red" rows={groups.pastDue} variant="past" />
          <DeadlineColumn title="Ending < 7d" color="orange" rows={groups.endingSoon} variant="future" />
          <DeadlineColumn title="Ending 7–30d" color="blue" rows={groups.endingMonth} variant="future" />
        </SimpleGrid>
      )}
    </Card>
  )
}
