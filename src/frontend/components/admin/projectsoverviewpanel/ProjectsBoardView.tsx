import { Badge, Card, Group, Progress, Stack, Text } from '@mantine/core'
import { TbLayoutBoard } from 'react-icons/tb'
import type { ProjectListItem, ProjectStatus } from '../../ProjectsPanel'
import { STATUS_COLOR, formatDate, isOverdue } from './constants'

const BOARD_STATUS_ORDER: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'DRAFT', 'COMPLETED', 'CANCELLED']
const BOARD_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  DRAFT: 'Draft',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export function ProjectsBoardView({
  projects,
  onSelect,
}: {
  projects: ProjectListItem[]
  onSelect: (p: ProjectListItem) => void
}) {
  const columns = BOARD_STATUS_ORDER.map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  })).filter((c) => c.items.length > 0)

  if (columns.length === 0) {
    return (
      <Card withBorder p="xl" radius="md">
        <Stack align="center" gap="xs">
          <TbLayoutBoard size={32} />
          <Text fw={500}>Tidak ada project yang cocok</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
      {columns.map(({ status, items }) => (
        <Stack key={status} gap="xs" style={{ minWidth: 240, width: 240, flexShrink: 0 }}>
          <Group gap="xs">
            <Badge color={STATUS_COLOR[status]} variant="light" size="sm">
              {BOARD_STATUS_LABEL[status]}
            </Badge>
            <Text size="xs" c="dimmed">
              {items.length}
            </Text>
          </Group>
          {items.map((p) => {
            const overdue = isOverdue(p)
            const taskTotal = p.taskStats?.total ?? 0
            const taskDone = p.taskStats?.closed ?? 0
            const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
            return (
              <Card
                key={p.id}
                withBorder
                padding="sm"
                radius="md"
                style={{ cursor: 'pointer', borderLeft: `3px solid var(--mantine-color-${STATUS_COLOR[status]}-5)` }}
                onClick={() => onSelect(p)}
              >
                <Stack gap={4}>
                  <Text size="xs" fw={600} lineClamp={2}>
                    {p.name}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {p.owner.name}
                  </Text>
                  {taskTotal > 0 && (
                    <Stack gap={2}>
                      <Text size="10px" c="dimmed">
                        {taskDone}/{taskTotal} tasks
                      </Text>
                      <Progress value={taskPct} size="xs" color={taskPct === 100 ? 'green' : 'blue'} />
                    </Stack>
                  )}
                  {p.endsAt && (
                    <Text size="10px" c={overdue ? 'red' : 'dimmed'} fw={overdue ? 600 : undefined}>
                      {overdue ? '⚠ ' : ''}
                      {formatDate(p.endsAt)}
                    </Text>
                  )}
                </Stack>
              </Card>
            )
          })}
        </Stack>
      ))}
    </div>
  )
}
