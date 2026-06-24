import { Alert, Badge, Card, Group, Progress, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbAlertTriangle, TbHeartbeat } from 'react-icons/tb'
import { GRADE_COLOR, PRIORITY_COLOR, SEVERITY_COLOR } from './constants'
import { RiskStat, SectionHeader } from './shared'
import type { Priority, ReportPayload } from './types'

export function HealthGridSection({ data }: { data: ReportPayload }) {
  const projects = data.health.projects.slice(0, 12)
  if (projects.length === 0) {
    return (
      <Card withBorder padding="md" radius="md" className="page-section">
        <SectionHeader icon={TbHeartbeat} color="teal" title="Kesehatan Proyek" subtitle="Skor A–F per proyek" />
        <Text size="sm" c="dimmed">
          Belum ada proyek untuk dinilai.
        </Text>
      </Card>
    )
  }
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbHeartbeat}
        color="teal"
        title="Kesehatan Proyek"
        subtitle={`${data.health.count} proyek · diurutkan dari terendah`}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm" mt="sm">
        {projects.map((p) => (
          <Card key={p.id} withBorder padding="sm" radius="md">
            <Group justify="space-between" mb={4}>
              <Badge color={GRADE_COLOR[p.grade]} variant="filled" size="lg">
                {p.grade}
              </Badge>
              <Badge size="xs" color={PRIORITY_COLOR[p.priority]} variant="light">
                {p.priority}
              </Badge>
            </Group>
            <Text fw={600} size="sm" truncate>
              {p.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {p.owner}
            </Text>
            <Progress value={p.score} color={GRADE_COLOR[p.grade]} size="sm" mt="xs" />
            <Group gap="xs" mt={6} wrap="nowrap">
              <Text size="xs" c="dimmed">
                open: <b>{p.openTasks}</b>
              </Text>
              {p.overdueTasks > 0 && (
                <Text size="xs" c="red">
                  overdue: <b>{p.overdueTasks}</b>
                </Text>
              )}
              {p.blockedTasks > 0 && (
                <Text size="xs" c="orange">
                  blocked: <b>{p.blockedTasks}</b>
                </Text>
              )}
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Card>
  )
}

export function RiskRadarSection({ data }: { data: ReportPayload }) {
  const r = data.risks
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color="red" size="md" radius="md">
            <TbAlertTriangle size={16} />
          </ThemeIcon>
          <div>
            <Title order={4}>Radar Risiko</Title>
            <Text size="xs" c="dimmed">
              Overdue, stale, pending agent, env hilang
            </Text>
          </div>
        </Group>
        <Badge color={SEVERITY_COLOR[r.severity]} variant="filled" size="lg" tt="uppercase">
          {r.severity}
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs" mb="md">
        <RiskStat label="Task Overdue" value={r.summary.overdueTasks} color="red" />
        <RiskStat label="Task Stale" value={r.summary.staleTasks} color="orange" />
        <RiskStat label="Proyek Lewat" value={r.summary.pastDueProjects} color="red" />
        <RiskStat label="Env Hilang" value={r.summary.missingEnv} color="red" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
            Task Overdue (top 5)
          </Text>
          {r.overdueTasks.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Stack gap={4}>
              {r.overdueTasks.slice(0, 5).map((t) => (
                <Group key={t.id} gap="xs" wrap="nowrap">
                  <Badge size="xs" color={PRIORITY_COLOR[t.priority as Priority] ?? 'gray'} variant="outline">
                    {t.priority}
                  </Badge>
                  <Text size="xs" style={{ flex: 1 }} truncate>
                    {t.title}{' '}
                    <Text span c="dimmed">
                      ({t.project})
                    </Text>
                  </Text>
                  <Text size="xs" c="red">
                    {t.daysOverdue ?? 0}d
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </div>
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
            Proyek Past-Due
          </Text>
          {r.pastDueProjects.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Stack gap={4}>
              {r.pastDueProjects.slice(0, 5).map((p) => (
                <Group key={p.id} gap="xs" wrap="nowrap">
                  <Text size="xs" style={{ flex: 1 }} truncate>
                    {p.name}{' '}
                    <Text span c="dimmed">
                      ({p.owner})
                    </Text>
                  </Text>
                  <Text size="xs" c="red">
                    {p.daysOverdue ?? 0}d
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
          {r.missingEnv.length > 0 && (
            <Alert color="red" mt="sm" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">
                Env vars hilang: <b>{r.missingEnv.join(', ')}</b>
              </Text>
            </Alert>
          )}
        </div>
      </SimpleGrid>
    </Card>
  )
}
