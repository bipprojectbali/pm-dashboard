import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { formatRelativeTime } from './helpers'
import type { OverviewTask } from './types'

const PRIORITY_COLOR: Record<OverviewTask['priority'], string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

function formatDueLabel(iso: string): { label: string; color: string } {
  const diff = new Date(iso).getTime() - Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.ceil(diff / dayMs)
  if (diff < 0) {
    const overdueDays = Math.abs(Math.floor(diff / dayMs))
    return { label: overdueDays === 0 ? 'Hari ini' : `Telat ${overdueDays}h`, color: 'red' }
  }
  if (days <= 1) return { label: 'Besok', color: 'orange' }
  if (days <= 3) return { label: `${days} hari`, color: 'orange' }
  return { label: `${days} hari`, color: 'blue' }
}

export function TaskRow({
  task,
  onOpen,
  showStale,
}: {
  task: OverviewTask
  onOpen: (t: OverviewTask) => void
  showStale?: boolean
}) {
  const due = task.dueAt ? formatDueLabel(task.dueAt) : null
  const staleFor = showStale ? formatRelativeTime(task.updatedAt) : null
  return (
    <UnstyledButton onClick={() => onOpen(task)} style={{ borderRadius: 6, padding: '8px 10px' }}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Badge color={PRIORITY_COLOR[task.priority]} variant="dot" size="sm" style={{ flexShrink: 0, marginTop: 2 }}>
          {task.kind}
        </Badge>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {task.title}
          </Text>
          <Group gap={6} wrap="nowrap">
            {task.project?.name && (
              <Text size="xs" c="dimmed" truncate>
                {task.project.name}
              </Text>
            )}
            {staleFor && (
              <Text size="xs" c="dimmed">
                · diam {staleFor}
              </Text>
            )}
          </Group>
        </div>
        {due && (
          <Badge color={due.color} variant="light" size="sm" style={{ flexShrink: 0 }}>
            {due.label}
          </Badge>
        )}
      </Group>
    </UnstyledButton>
  )
}
