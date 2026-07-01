import { Badge, Group, Paper, Text } from '@mantine/core'
import { PhaseActionsMenu } from '../PhaseActionsMenu'
import {
  formatPhaseDate,
  PHASE_STATUS_COLOR,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  type ProjectPhase,
} from '../phase.types'

export function PhaseListRow({
  phase,
  canManage,
  onView,
  onStart,
  onComplete,
  onEdit,
  onDelete,
}: {
  phase: ProjectPhase
  canManage: boolean
  onView: () => void
  onStart: () => void
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const StatusIcon = PHASE_STATUS_ICON[phase.status]
  const color = PHASE_STATUS_COLOR[phase.status]
  const dateRange =
    phase.startsAt || phase.endsAt
      ? `${formatPhaseDate(phase.startsAt) ?? '?'} – ${formatPhaseDate(phase.endsAt) ?? '?'}`
      : null

  return (
    <Paper
      withBorder
      radius="sm"
      p="xs"
      onClick={onView}
      style={{ cursor: 'pointer', borderLeft: `3px solid var(--mantine-color-${color}-5)` }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Badge
            size="xs"
            color={color}
            variant="light"
            leftSection={<StatusIcon size={11} />}
            style={{ flexShrink: 0 }}
          >
            {PHASE_STATUS_LABEL[phase.status]}
          </Badge>
          <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
            {phase.title}
          </Text>
          {phase.tags.map(({ tag }) => (
            <Badge key={tag.id} size="xs" color={tag.color} variant="light" style={{ flexShrink: 0 }}>
              {tag.name}
            </Badge>
          ))}
        </Group>
        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
          {dateRange && (
            <Text size="xs" c="dimmed" visibleFrom="sm">
              {dateRange}
            </Text>
          )}
          <Badge size="xs" variant="default" color="gray">
            {phase._count.tasks} task
          </Badge>
          {canManage && (
            <PhaseActionsMenu
              phase={phase}
              onView={onView}
              onStart={onStart}
              onComplete={onComplete}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </Group>
      </Group>
    </Paper>
  )
}
