import { ActionIcon, Badge, Box, Card, Group, Progress, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbCalendarEvent, TbPencil, TbUsers } from 'react-icons/tb'
import { computeOverdue, formatDate } from './helpers'
import { PRIORITY_COLOR, STATUS_COLOR, type ProjectListItem } from './types'

export function ProjectListRow({
  project: p,
  isSystemAdmin: isAdmin,
  onOpen,
  onEdit,
}: {
  project: ProjectListItem
  isSystemAdmin: boolean
  onOpen?: () => void
  onEdit: () => void
}) {
  const { overdue, daysOver } = computeOverdue(p)
  const canEdit = isAdmin || p.myRole === 'OWNER' || p.myRole === 'PM'
  const taskDone =
    p.taskStats && p.taskStats.total > 0 ? Math.round((p.taskStats.closed / p.taskStats.total) * 100) : null
  const [_hover, setHover] = useState(false)

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: onOpen ? 'pointer' : 'default', transition: 'box-shadow 120ms ease' }}
      onClick={onOpen}
    >
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate style={{ minWidth: 0, flex: '0 1 auto', maxWidth: 260 }}>
            {p.name}
          </Text>
          <Group gap={4} wrap="nowrap" visibleFrom="sm">
            <Badge color={STATUS_COLOR[p.status]} variant="light" size="xs">
              {p.status.replace('_', ' ')}
            </Badge>
            <Badge color={PRIORITY_COLOR[p.priority]} variant="dot" size="xs">
              {p.priority}
            </Badge>
            {overdue && (
              <Badge color="red" variant="filled" size="xs">
                Overdue {daysOver}d
              </Badge>
            )}
          </Group>
        </Group>

        <Group gap="lg" wrap="nowrap" visibleFrom="md" style={{ flexShrink: 0 }}>
          {taskDone !== null && (
            <Group gap={6} wrap="nowrap">
              <Box style={{ width: 80 }}>
                <Progress value={taskDone} size="xs" color={taskDone === 100 ? 'green' : 'blue'} />
              </Box>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {taskDone}%
              </Text>
            </Group>
          )}
          {(p.startsAt || p.endsAt) && (
            <Group gap={4} wrap="nowrap">
              <TbCalendarEvent size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {formatDate(p.endsAt) ?? '—'}
              </Text>
            </Group>
          )}
          <Group gap={4} wrap="nowrap">
            <TbUsers size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {p._count.members}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" truncate style={{ maxWidth: 120 }}>
            {p.owner.name}
          </Text>
        </Group>

        {canEdit && (
          <Tooltip label="Edit project">
            <ActionIcon
              variant="subtle"
              size="sm"
              style={{ flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            >
              <TbPencil size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Card>
  )
}
