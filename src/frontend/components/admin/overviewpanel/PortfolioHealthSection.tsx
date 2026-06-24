import { Badge, Card, Group, SimpleGrid, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { useNavigate } from '@tanstack/react-router'
import { TbHeartbeat, TbInfoCircle } from 'react-icons/tb'
import { GRADE_COLOR } from './constants'
import type { HealthRow } from './types'

export function PortfolioHealthSection({
  rows,
  navigate,
}: {
  rows: HealthRow[]
  navigate: ReturnType<typeof useNavigate>
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="blue" size="md" radius="md">
          <TbHeartbeat size={16} />
        </ThemeIcon>
        <Title order={5}>Kesehatan Portfolio</Title>
        <Tooltip
          multiline
          w={340}
          withArrow
          label="Skor kesehatan 0–100 per project (A–F). Mulai dari 100 dan dikurangi: -35 jika past-due, -5 per overdue task (max 25), -3 per blocked task (max 15), -10 jika extensions >2, tambahan -5 jika >4, -10 jika project ACTIVE tanpa aktivitas. Diurutkan dari skor terburuk."
        >
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">
          sorted by score (worst first)
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="xs">
        {rows.map((r) => (
          <Card
            key={r.id}
            withBorder
            padding="sm"
            radius="md"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate({ to: '/admin', search: { tab: 'projects' } })}
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={600} truncate>
                  {r.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {r.status} · {r.openTasks} open · {r.closed7d} closed/7d
                </Text>
                {(r.overdueTasks > 0 || r.blockedTasks > 0 || r.pastDue) && (
                  <Group gap={4} mt={4}>
                    {r.overdueTasks > 0 && (
                      <Badge size="xs" color="red" variant="light">
                        {r.overdueTasks} overdue
                      </Badge>
                    )}
                    {r.blockedTasks > 0 && (
                      <Badge size="xs" color="orange" variant="light">
                        {r.blockedTasks} blocked
                      </Badge>
                    )}
                    {r.pastDue && (
                      <Badge size="xs" color="red" variant="filled">
                        past-due
                      </Badge>
                    )}
                  </Group>
                )}
              </div>
              <Badge color={GRADE_COLOR[r.grade] ?? 'gray'} variant="filled" size="lg">
                {r.grade}
              </Badge>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Card>
  )
}
