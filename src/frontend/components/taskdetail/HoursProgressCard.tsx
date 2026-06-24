import { Card, Group, Progress, Text } from '@mantine/core'
import { TbClock } from 'react-icons/tb'
import type { TaskDetail } from './types'

export function HoursProgressCard({ task }: { task: TaskDetail }) {
  const variance =
    task.estimateHours != null && task.actualHours != null ? task.actualHours - task.estimateHours : null
  const varianceColor = variance == null ? undefined : variance > 0 ? 'red' : 'green'

  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="xl" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed">
            <TbClock size={10} style={{ marginRight: 4 }} />
            Estimate
          </Text>
          <Text fw={600}>{task.estimateHours != null ? `${task.estimateHours}h` : '—'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Actual (wall clock)
          </Text>
          <Text fw={600}>
            {task.actualHours != null ? `${task.actualHours}h` : task.status === 'CLOSED' ? '0h' : '—'}
          </Text>
        </div>
        {variance != null && (
          <div>
            <Text size="xs" c="dimmed">
              Variance
            </Text>
            <Text fw={600} c={varianceColor}>
              {variance > 0 ? '+' : ''}
              {variance.toFixed(1)}h
            </Text>
          </div>
        )}
        {task.progressPercent != null && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Progress
              </Text>
              <Text size="xs" c="dimmed">
                {task.progressPercent}%
              </Text>
            </Group>
            <Progress
              value={task.progressPercent}
              size="sm"
              mt={2}
              color={task.status === 'CLOSED' ? 'green' : 'blue'}
            />
          </div>
        )}
      </Group>
    </Card>
  )
}
