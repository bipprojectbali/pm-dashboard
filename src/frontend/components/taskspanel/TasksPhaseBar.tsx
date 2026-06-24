import { Badge, Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import { TbInfoCircle } from 'react-icons/tb'

function PhasePill({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <Badge
      color={color}
      variant={active ? 'filled' : 'light'}
      size="sm"
      style={{ cursor: 'pointer', userSelect: 'none', ...(active ? { color: 'white' } : {}) }}
      onClick={onClick}
    >
      {label}
      {count !== undefined ? ` · ${count}` : ''}
    </Badge>
  )
}

interface Phase {
  id: string
  title: string
  status: string
  _count: { tasks: number }
}

export function TasksPhaseBar({
  phases,
  phaseFilter,
  onPhaseChange,
}: {
  phases: Phase[]
  phaseFilter: string | null
  onPhaseChange: (id: string | null) => void
}) {
  if (phases.length === 0) return null
  return (
    <Card withBorder padding="xs" radius="md">
      <Group gap={6} wrap="wrap" align="center">
        <Group gap={4} align="center" mr={4}>
          <Text size="xs" fw={600} c="dimmed">
            Fase
          </Text>
          <Tooltip
            label={
              <Stack gap={4}>
                <Text size="xs" fw={600}>Apa itu Fase?</Text>
                <Text size="xs">Fase adalah tahapan atau sprint dalam proyek — misalnya Planning, Development, Testing, Release. Setiap task bisa dimasukkan ke satu fase agar lebih mudah dilacak per tahapan.</Text>
                <Text size="xs" fw={600} mt={2}>Cara pakai filter ini</Text>
                <Text size="xs">• Klik fase untuk filter — klik lagi untuk reset</Text>
                <Text size="xs">• Angka di setiap pill = jumlah task dalam fase</Text>
                <Text size="xs">• "Tanpa Fase" = task yang belum masuk fase manapun</Text>
                <Text size="xs" c="dimmed" mt={2}>Kelola fase di tab Fase pada halaman detail proyek.</Text>
              </Stack>
            }
            withArrow
            position="bottom-start"
            multiline
            w={300}
          >
            <TbInfoCircle size={12} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
          </Tooltip>
        </Group>
        <PhasePill label="Semua" active={phaseFilter === null} color="blue" onClick={() => onPhaseChange(null)} />
        {phases.map((p) => (
          <PhasePill
            key={p.id}
            label={p.title}
            count={p._count.tasks}
            active={phaseFilter === p.id}
            color={p.status === 'COMPLETED' ? 'green' : p.status === 'ACTIVE' ? 'blue' : 'gray'}
            onClick={() => onPhaseChange(phaseFilter === p.id ? null : p.id)}
          />
        ))}
        <PhasePill
          label="Tanpa Fase"
          active={phaseFilter === 'none'}
          color="gray"
          onClick={() => onPhaseChange(phaseFilter === 'none' ? null : 'none')}
        />
      </Group>
    </Card>
  )
}
