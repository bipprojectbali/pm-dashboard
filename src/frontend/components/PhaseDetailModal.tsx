import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { formatPhaseDate, PHASE_STATUS_COLOR, type ProjectPhase } from './phase.types'

export function PhaseDetailModal({ phase }: { phase: ProjectPhase }) {
  const range =
    phase.startsAt || phase.endsAt
      ? `${formatPhaseDate(phase.startsAt) ?? '?'} – ${formatPhaseDate(phase.endsAt) ?? '?'}`
      : null
  return (
    <Stack gap="sm">
      <Group gap={6} wrap="wrap">
        <Badge size="sm" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
          {phase.status}
        </Badge>
        <Badge size="sm" variant="default" color="gray">
          {phase._count.tasks} task
        </Badge>
        {phase.tags.map(({ tag }) => (
          <Badge key={tag.id} size="sm" color={tag.color} variant="light">
            {tag.name}
          </Badge>
        ))}
      </Group>
      {range && (
        <div>
          <Text size="xs" fw={600} c="dimmed">
            Periode
          </Text>
          <Text size="sm">{range}</Text>
        </div>
      )}
      <div>
        <Text size="xs" fw={600} c="dimmed">
          Deskripsi
        </Text>
        <Text size="sm" c={phase.description ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
          {phase.description || 'Tidak ada deskripsi.'}
        </Text>
      </div>
      {phase.status === 'COMPLETED' && (
        <>
          <Divider />
          <Card withBorder radius="sm" p="sm" bg="var(--mantine-color-green-light)">
            <Text size="xs" fw={600} mb={4} c="var(--mantine-color-green-light-color)">
              Kesimpulan
            </Text>
            <Text size="sm" c={phase.summary ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
              {phase.summary || 'Tidak ada kesimpulan.'}
            </Text>
          </Card>
        </>
      )}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Tutup
        </Button>
      </Group>
    </Stack>
  )
}
