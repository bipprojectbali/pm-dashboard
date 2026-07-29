import { Alert, Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { useNavigate } from '@tanstack/react-router'
import { TbFlame, TbInfoCircle, TbShieldCheck } from 'react-icons/tb'
import { PRIORITY_COLOR, SEVERITY_COLOR } from './constants'
import type { RiskReport } from './types'

function RiskStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500} tt="uppercase">
        {label}
      </Text>
      <Text fw={700} size="lg" c={value > 0 ? color : undefined}>
        {value}
      </Text>
    </div>
  )
}

export function RedFlagsSection({ risks, navigate }: { risks: RiskReport; navigate: ReturnType<typeof useNavigate> }) {
  const s = risks.summary
  const nothing = s.overdueTasks + s.staleTasks + s.pastDueProjects + s.missingEnv === 0

  if (nothing) {
    return (
      <Alert color="teal" icon={<TbShieldCheck size={18} />} variant="light">
        <Text size="sm" fw={500}>
          Semua sistem hijau — tidak ada red flag saat ini.
        </Text>
      </Alert>
    )
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color={SEVERITY_COLOR[risks.severity]} size="md" radius="md">
            <TbFlame size={16} />
          </ThemeIcon>
          <Title order={5}>Sinyal Peringatan</Title>
          <Badge color={SEVERITY_COLOR[risks.severity]} variant="light" size="sm">
            {risks.severity.toUpperCase()}
          </Badge>
          <Tooltip
            multiline
            w={320}
            withArrow
            label="Ringkasan isu yang butuh perhatian saat ini: tugas lewat tenggat, tugas IN_PROGRESS yang mandek, proyek telat, dan variabel env wajib yang belum diisi. Severity dihitung otomatis (high/medium/low/none) dari kombinasi sinyal tersebut."
          >
            <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
              <TbInfoCircle size={14} />
            </ThemeIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }} spacing="xs" mb="md">
        <RiskStat label="Overdue tasks" value={s.overdueTasks} color={s.overdueTasks > 0 ? 'red' : 'gray'} />
        <RiskStat label="Stale IN_PROGRESS" value={s.staleTasks} color={s.staleTasks > 0 ? 'orange' : 'gray'} />
        <RiskStat label="Past-due projects" value={s.pastDueProjects} color={s.pastDueProjects > 0 ? 'red' : 'gray'} />
        <RiskStat label="Missing env" value={s.missingEnv} color={s.missingEnv > 0 ? 'red' : 'gray'} />
      </SimpleGrid>

      {risks.missingEnv.length > 0 && (
        <Alert color="red" variant="light" mb="xs">
          <Text size="xs" fw={500}>
            Missing env: {risks.missingEnv.join(', ')}
          </Text>
        </Alert>
      )}

      {risks.overdueTasks.length > 0 && (
        <Stack gap={4} mb="sm">
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            Overdue — top 5
          </Text>
          {risks.overdueTasks.slice(0, 5).map((t) => (
            <Group key={t.id} gap="xs" wrap="nowrap">
              <Badge size="xs" color={PRIORITY_COLOR[t.priority] ?? 'gray'} variant="outline">
                {t.priority}
              </Badge>
              <Text
                size="sm"
                style={{ flex: 1, cursor: 'pointer' }}
                truncate
                onClick={() => navigate({ to: '/admin', search: { tab: 'projects' } })}
              >
                {t.title}
              </Text>
              <Text size="xs" c="red">
                {t.daysOverdue ?? 0}d overdue
              </Text>
              <Text size="xs" c="dimmed" style={{ minWidth: 120, textAlign: 'right' }} truncate>
                {t.assignee ?? 'unassigned'}
              </Text>
            </Group>
          ))}
          {risks.overdueTasks.length > 5 && (
            <Text size="xs" c="dimmed" fs="italic">
              +{risks.overdueTasks.length - 5} lagi — lihat semua di tab Tasks
            </Text>
          )}
        </Stack>
      )}

      {risks.pastDueProjects.length > 0 && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            Past-due projects{risks.pastDueProjects.length > 3 ? ' — top 3' : ''}
          </Text>
          {risks.pastDueProjects.slice(0, 3).map((p) => (
            <Group key={p.id} gap="xs" wrap="nowrap">
              <Badge size="xs" color={PRIORITY_COLOR[p.priority] ?? 'gray'} variant="outline">
                {p.priority}
              </Badge>
              <Text size="sm" style={{ flex: 1 }} truncate>
                {p.name}
              </Text>
              <Text size="xs" c="red">
                {p.daysOverdue ?? 0}d past
              </Text>
              <Text size="xs" c="dimmed" style={{ minWidth: 120, textAlign: 'right' }} truncate>
                {p.owner}
              </Text>
            </Group>
          ))}
          {risks.pastDueProjects.length > 3 && (
            <Text size="xs" c="dimmed" fs="italic">
              +{risks.pastDueProjects.length - 3} lagi — lihat semua di tab Projects
            </Text>
          )}
        </Stack>
      )}
    </Card>
  )
}
