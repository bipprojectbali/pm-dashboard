import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbAlarm, TbCircleCheck, TbListCheck, TbLock, TbUser } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { fmtRange } from './constants'
import { SectionHeader } from './shared'
import type { UserReportPayload } from './types'

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

export function UserCoverSection({ data }: { data: UserReportPayload }) {
  return (
    <Card withBorder padding="xl" radius="md" className="page-section cover-card">
      <Stack gap="md" align="flex-start">
        <Badge color="violet" variant="light" size="lg">
          Laporan Per User
        </Badge>
        <Group gap="sm">
          <UserAvatar name={data.user.name} image={data.user.image} size={48} color="blue" />
          <Title order={1} style={{ fontSize: 32, lineHeight: 1.15 }}>
            {data.user.name}
          </Title>
        </Group>
        <Text c="dimmed" size="lg">
          {data.user.email} · Periode: <b>{fmtRange(data.window.since, data.window.until)}</b> · {data.window.days} hari
        </Text>
        <Group gap="xl" mt="sm">
          <Stat label="Total task" value={data.total} />
          <Stat label="Open" value={data.open} />
          <Stat label="Selesai (periode)" value={data.taskSnapshot.closedInPeriod} />
          <Stat label="Overdue" value={data.overdue} />
        </Group>
        <Text size="xs" c="dimmed" mt="lg">
          Dibuat: {new Date(data.generatedAt).toLocaleString('id-ID')} · oleh {data.generatedBy.email}
        </Text>
      </Stack>
    </Card>
  )
}

export function UserExecutiveSummary({ data }: { data: UserReportPayload }) {
  const items = [
    { label: 'Total Task', value: data.total, sub: `${data.open} open`, color: 'blue', icon: TbListCheck },
    {
      label: 'Overdue',
      value: data.overdue,
      sub: data.blocked > 0 ? `${data.blocked} blocked` : undefined,
      color: 'red',
      icon: TbAlarm,
    },
    {
      label: 'Selesai (periode)',
      value: data.taskSnapshot.closedInPeriod,
      sub: `${data.taskSnapshot.createdInPeriod} dibuat`,
      color: 'teal',
      icon: TbCircleCheck,
    },
    { label: 'Blocked', value: data.blocked, color: 'orange', icon: TbLock },
    {
      label: 'Effort Actual (h)',
      value: data.effort.actualHours,
      sub: `est. ${data.effort.estimateHours}h`,
      color: 'cyan',
      icon: TbUser,
    },
  ]
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbUser}
        color="blue"
        title="Ringkasan Eksekutif"
        subtitle="Indikator kinerja untuk user ini"
      />
      <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md" mt="sm">
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
