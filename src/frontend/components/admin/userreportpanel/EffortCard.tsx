import { Card, Group, SimpleGrid, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbClock, TbInfoCircle } from 'react-icons/tb'
import type { UserReportData } from './types'

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500} tt="uppercase">{label}</Text>
      <Text fw={700} size="lg" c={color}>{value}</Text>
    </div>
  )
}

export function EffortCard({ effort, className }: { effort: UserReportData['effort']; className?: string }) {
  return (
    <Card withBorder padding="md" radius="md" className={className}>
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="cyan" size="md" radius="md">
          <TbClock size={16} />
        </ThemeIcon>
        <Title order={5}>Effort</Title>
        <Tooltip
          multiline
          w={320}
          withArrow
          label="actualHours dihitung dari closedAt − startsAt (atau createdAt) task yang sudah CLOSED. over/under/on = perbandingan actual vs estimateHours dengan threshold ±25%."
        >
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="xs">
        <Stat label="Actual (h)" value={effort.actualHours} />
        <Stat label="Estimate (h)" value={effort.estimateHours} />
        <Stat label="Over" value={effort.over} color={effort.over > 0 ? 'red' : undefined} />
        <Stat label="Under" value={effort.under} color={effort.under > 0 ? 'orange' : undefined} />
        <Stat label="On target" value={effort.on} color={effort.on > 0 ? 'teal' : undefined} />
      </SimpleGrid>
    </Card>
  )
}
