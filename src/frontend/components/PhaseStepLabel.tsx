import { Badge, Button, Group, Text } from '@mantine/core'
import { PhaseActionsMenu } from './PhaseActionsMenu'
import { PHASE_STATUS_COLOR, type ProjectPhase } from './phase.types'

export function PhaseStepLabel({
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
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm" fw={500} style={{ cursor: 'pointer' }} onClick={onView}>
        {phase.title}
      </Text>
      <Badge size="xs" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
        {phase.status}
      </Badge>
      <Badge size="xs" variant="default" color="gray">
        {phase._count.tasks} task
      </Badge>
      {phase.tags.map(({ tag }) => (
        <Badge key={tag.id} size="xs" color={tag.color} variant="light">
          {tag.name}
        </Badge>
      ))}
      {canManage ? (
        <PhaseActionsMenu
          phase={phase}
          onView={onView}
          onStart={onStart}
          onComplete={onComplete}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onView}>
          Detail
        </Button>
      )}
    </Group>
  )
}
