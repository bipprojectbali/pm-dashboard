import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { IconType } from 'react-icons'
import {
  TbChartBar,
  TbClockHour3,
  TbHeartbeat,
  TbListCheck,
  TbTarget,
  TbUsersGroup,
} from 'react-icons/tb'
import { fmtRange } from './constants'
import { SectionHeader } from './shared'
import type { ReportPayload } from './types'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </div>
  )
}

export function CoverSection({ data }: { data: ReportPayload }) {
  return (
    <Card withBorder padding="xl" radius="md" className="page-section cover-card">
      <Stack gap="md" align="flex-start">
        <Badge color="violet" variant="light" size="lg">
          Laporan Portfolio
        </Badge>
        <Title order={1} style={{ fontSize: 36, lineHeight: 1.15 }}>
          Ringkasan Eksekutif &amp; Analitik Proyek
        </Title>
        <Text c="dimmed" size="lg">
          Periode: <b>{fmtRange(data.window.since, data.window.until)}</b> · {data.window.days} hari
        </Text>
        <Group gap="xl" mt="sm">
          <Stat label="Proyek aktif" value={data.kpis.projects.active} />
          <Stat label="Task terbuka" value={data.kpis.tasks.total - (data.kpis.tasks.byStatus.CLOSED ?? 0)} />
          <Stat label="Task selesai (periode)" value={data.taskSnapshot.closedInPeriod} />
          <Stat
            label="Skor rata-rata"
            value={data.taskSnapshot.avgHealthScore != null ? `${data.taskSnapshot.avgHealthScore}/100` : '—'}
          />
        </Group>
        <Text size="xs" c="dimmed" mt="lg">
          Dibuat: {new Date(data.generatedAt).toLocaleString('id-ID')} · oleh {data.generatedBy.email}
        </Text>
      </Stack>
    </Card>
  )
}

export function ExecutiveSummary({ data }: { data: ReportPayload }) {
  const k = data.kpis
  const openTasks = k.tasks.total - (k.tasks.byStatus.CLOSED ?? 0)
  const items: Array<{ label: string; value: string | number; sub?: string; color: string; icon: IconType }> = [
    { label: 'Total Pengguna', value: k.users.total, sub: `${k.users.blocked} diblokir`, color: 'violet', icon: TbUsersGroup },
    {
      label: 'Proyek Aktif',
      value: k.projects.active,
      sub: `dari ${Object.values(k.projects.byStatus).reduce((a, b) => a + b, 0)} total`,
      color: 'blue',
      icon: TbTarget,
    },
    { label: 'Task Terbuka', value: openTasks, sub: `${k.tasks.overdueOpen} overdue`, color: 'red', icon: TbListCheck },
    { label: 'Agent Live', value: k.agents.live, sub: `${k.agents.pending} pending`, color: 'teal', icon: TbHeartbeat },
    {
      label: 'Task Selesai (periode)',
      value: data.taskSnapshot.closedInPeriod,
      sub: `${data.taskSnapshot.createdInPeriod} dibuat`,
      color: 'green',
      icon: TbListCheck,
    },
    { label: 'Extensions 7h', value: k.velocity.extensions7d, sub: 'deadline dipush', color: 'orange', icon: TbClockHour3 },
  ]
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader icon={TbChartBar} color="blue" title="Ringkasan Eksekutif" subtitle="Indikator kinerja utama" />
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md" mt="sm">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <Card key={it.label} withBorder padding="sm" radius="md" bg="var(--mantine-color-default-hover)">
              <Group gap="xs" mb={4}>
                <ThemeIcon variant="light" color={it.color} size="sm" radius="md">
                  <Icon size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed" fw={500}>
                  {it.label}
                </Text>
              </Group>
              <Text size="xl" fw={700}>
                {it.value}
              </Text>
              {it.sub && (
                <Text size="xs" c="dimmed">
                  {it.sub}
                </Text>
              )}
            </Card>
          )
        })}
      </SimpleGrid>
    </Card>
  )
}
