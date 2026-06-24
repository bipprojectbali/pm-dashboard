import { Card, Group, SimpleGrid, Text, ThemeIcon } from '@mantine/core'
import { TbAlertTriangle, TbCircleCheck, TbFile, TbFileAlert } from 'react-icons/tb'
import type { Summary } from './types'

type FilterValue = 'all' | 'warning' | 'over'

type Props = {
  summary: Summary | undefined
  filter: FilterValue
  onFilterChange: (f: FilterValue) => void
}

export function FileHealthSummaryCards({ summary, filter, onFilterChange }: Props) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      <Card withBorder p="sm" radius="md">
        <Group gap="xs" mb={4}>
          <ThemeIcon size="xs" variant="light" color="blue">
            <TbFile size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">Total file</Text>
        </Group>
        <Text fw={700} size="xl">{summary?.total ?? '—'}</Text>
      </Card>

      <Card withBorder p="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => onFilterChange('all')}>
        <Group gap="xs" mb={4}>
          <ThemeIcon size="xs" variant="light" color="teal">
            <TbCircleCheck size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">OK</Text>
        </Group>
        <Text fw={700} size="xl" c="teal">{summary?.ok ?? '—'}</Text>
      </Card>

      <Card
        withBorder
        p="sm"
        radius="md"
        style={{
          cursor: 'pointer',
          outline: filter === 'warning' ? '2px solid var(--mantine-color-yellow-5)' : undefined,
        }}
        onClick={() => onFilterChange('warning')}
      >
        <Group gap="xs" mb={4}>
          <ThemeIcon size="xs" variant="light" color="yellow">
            <TbAlertTriangle size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">Warning (≥70%)</Text>
        </Group>
        <Text fw={700} size="xl" c="yellow">{summary?.warning ?? '—'}</Text>
      </Card>

      <Card
        withBorder
        p="sm"
        radius="md"
        style={{
          cursor: 'pointer',
          outline: filter === 'over' ? '2px solid var(--mantine-color-red-5)' : undefined,
        }}
        onClick={() => onFilterChange('over')}
      >
        <Group gap="xs" mb={4}>
          <ThemeIcon size="xs" variant="light" color="red">
            <TbFileAlert size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">Over limit</Text>
        </Group>
        <Text fw={700} size="xl" c="red">{summary?.over ?? '—'}</Text>
      </Card>
    </SimpleGrid>
  )
}
