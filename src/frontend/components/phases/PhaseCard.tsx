import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { TbCalendarEvent } from 'react-icons/tb'
import { PhaseActionsMenu } from '../PhaseActionsMenu'
import {
  formatPhaseDate,
  PHASE_STATUS_COLOR,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  type ProjectPhase,
} from '../phase.types'

export function PhaseCard({
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

  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      onClick={onView}
      style={{ cursor: 'pointer', borderLeft: `3px solid var(--mantine-color-${color}-5)` }}
    >
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1 }}>
            {phase.title}
          </Text>
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

        <Group gap={6} wrap="wrap">
          <Badge size="xs" color={color} variant="light" leftSection={<StatusIcon size={11} />}>
            {PHASE_STATUS_LABEL[phase.status]}
          </Badge>
          <Badge size="xs" variant="default" color="gray">
            {phase._count.tasks} task
          </Badge>
          {phase.tags.map(({ tag }) => (
            <Badge key={tag.id} size="xs" color={tag.color} variant="light">
              {tag.name}
            </Badge>
          ))}
        </Group>

        {phase.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {phase.description}
          </Text>
        )}

        {(phase.startsAt || phase.endsAt) && (
          <Group gap={4}>
            <TbCalendarEvent size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              {formatPhaseDate(phase.startsAt) ?? '?'} – {formatPhaseDate(phase.endsAt) ?? '?'}
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  )
}
