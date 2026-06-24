import { Group, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { TbChecks, TbFlag } from 'react-icons/tb'
import type { TaskStats } from './types'

type Props = {
  timeProgress: number | null
  overdue: boolean
  taskStats?: TaskStats
  milestoneStats?: { done: number; total: number }
}

export function ProjectCardStats({ timeProgress, overdue, taskStats, milestoneStats }: Props) {
  return (
    <Stack gap={6}>
      {timeProgress !== null && (
        <div>
          <Group justify="space-between" gap={4} mb={2}>
            <Text size="xs" c="dimmed">
              Timeline
            </Text>
            <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
              {timeProgress}%
            </Text>
          </Group>
          <Progress
            value={timeProgress}
            size="xs"
            color={overdue ? 'red' : timeProgress > 80 ? 'orange' : 'indigo'}
            style={{ opacity: 0.7 }}
          />
        </div>
      )}

      {taskStats && taskStats.total > 0 && (
        <div>
          <Group justify="space-between" gap={4} mb={2}>
            <Group gap={4}>
              <TbChecks size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                Tasks
              </Text>
            </Group>
            <Tooltip
              label={`${taskStats.closed} closed · ${taskStats.inProgress} in progress · ${taskStats.readyForQc} QC · ${taskStats.open + taskStats.reopened} open`}
            >
              <Text size="xs" c="dimmed">
                {taskStats.closed}/{taskStats.total} ·{' '}
                {Math.round((taskStats.closed / taskStats.total) * 100)}%
              </Text>
            </Tooltip>
          </Group>
          <Progress.Root size="xs" style={{ opacity: 0.7 }}>
            <Tooltip label={`Closed · ${taskStats.closed}`}>
              <Progress.Section value={(taskStats.closed / taskStats.total) * 100} color="teal" />
            </Tooltip>
            <Tooltip label={`Ready for QC · ${taskStats.readyForQc}`}>
              <Progress.Section value={(taskStats.readyForQc / taskStats.total) * 100} color="cyan" />
            </Tooltip>
            <Tooltip label={`In progress · ${taskStats.inProgress}`}>
              <Progress.Section value={(taskStats.inProgress / taskStats.total) * 100} color="indigo" />
            </Tooltip>
            <Tooltip label={`Open / Reopened · ${taskStats.open + taskStats.reopened}`}>
              <Progress.Section
                value={((taskStats.open + taskStats.reopened) / taskStats.total) * 100}
                color="gray"
              />
            </Tooltip>
          </Progress.Root>
        </div>
      )}

      {milestoneStats && milestoneStats.total > 0 && (
        <div>
          <Group justify="space-between" gap={4} mb={2}>
            <Group gap={4}>
              <TbFlag size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                Milestones
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {milestoneStats.done}/{milestoneStats.total}
            </Text>
          </Group>
          <Progress
            value={(milestoneStats.done / milestoneStats.total) * 100}
            size="xs"
            color="violet"
            style={{ opacity: 0.7 }}
          />
        </div>
      )}
    </Stack>
  )
}
