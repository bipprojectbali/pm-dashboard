import { ActionIcon, Card, Collapse, Group, Stack, Text } from '@mantine/core'
import { TbChevronDown, TbChevronRight, TbEdit } from 'react-icons/tb'
import { formatPhaseDate, type ProjectPhase } from './phase.types'

export function PhaseStepDescription({
  phase,
  canManage,
  expanded,
  onToggleSummary,
  onEditSummary,
}: {
  phase: ProjectPhase
  canManage: boolean
  expanded: boolean
  onToggleSummary: () => void
  onEditSummary: () => void
}) {
  return (
    <Stack gap={4} mt={2}>
      {(phase.startsAt || phase.endsAt) && (
        <Text size="xs" c="dimmed">
          {formatPhaseDate(phase.startsAt) ?? '?'} – {formatPhaseDate(phase.endsAt) ?? '?'}
        </Text>
      )}
      {phase.status === 'COMPLETED' && (
        <Card withBorder radius="sm" p="xs" bg="var(--mantine-color-green-light)">
          <Group justify="space-between" gap={4} style={{ cursor: 'pointer' }} onClick={onToggleSummary}>
            <Group gap={4}>
              {expanded
                ? <TbChevronDown size={12} color="var(--mantine-color-green-light-color)" />
                : <TbChevronRight size={12} color="var(--mantine-color-green-light-color)" />}
              <Text size="xs" fw={600} c="var(--mantine-color-green-light-color)">
                Kesimpulan
              </Text>
            </Group>
            {canManage && expanded && (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="green"
                onClick={(e) => { e.stopPropagation(); onEditSummary() }}
              >
                <TbEdit size={12} />
              </ActionIcon>
            )}
          </Group>
          <Collapse in={expanded}>
            <Text size="xs" c={phase.summary ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }} mt={6}>
              {phase.summary || '—'}
            </Text>
          </Collapse>
        </Card>
      )}
    </Stack>
  )
}
