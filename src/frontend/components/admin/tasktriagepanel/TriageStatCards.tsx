import { Card, Group, SimpleGrid, Text, ThemeIcon } from '@mantine/core'
import { TbAlertTriangle, TbBan, TbClock, TbListCheck, TbUserQuestion } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { STALE_DAYS } from './types'

export type TriageStats = {
  total: number
  overdue: number
  unassigned: number
  blocked: number
  stale: number
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  tip,
}: {
  label: string
  value: number
  icon: typeof TbListCheck
  color: string
  tip?: string
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start">
        <div style={{ flex: 1 }}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={500} tt="uppercase">
              {label}
            </Text>
            {tip && <InfoTip label={tip} size={12} />}
          </Group>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size="md" radius="md">
          <Icon size={16} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}

export function TriageStatCards({
  stats,
  hideOverdueBlocked = false,
}: {
  stats: TriageStats
  hideOverdueBlocked?: boolean
}) {
  return (
    <SimpleGrid cols={{ base: 2, md: hideOverdueBlocked ? 3 : 5 }} spacing="md">
      <StatCard
        label="Open"
        value={stats.total}
        icon={TbListCheck}
        color="blue"
        tip="Task dengan status selain CLOSED. Total beban kerja yang masih harus dikerjakan."
      />
      {!hideOverdueBlocked && (
        <StatCard
          label="Overdue"
          value={stats.overdue}
          icon={TbAlertTriangle}
          color="red"
          tip="Task open yang sudah melewati waktu jatuh tempo (dueAt < sekarang). Perlu prioritas segera atau di-extend deadline-nya."
        />
      )}
      <StatCard
        label="Unassigned"
        value={stats.unassigned}
        icon={TbUserQuestion}
        color="orange"
        tip="Task open tanpa assignee. Risiko: tidak ada yang merasa bertanggung jawab, kemungkinan besar akan stale."
      />
      {!hideOverdueBlocked && (
        <StatCard
          label="Blocked"
          value={stats.blocked}
          icon={TbBan}
          color="grape"
          tip="Task open dengan TaskDependency (blockedBy > 0). Harus menunggu task lain selesai dulu sebelum bisa dikerjakan."
        />
      )}
      <StatCard
        label={`Stale >${STALE_DAYS}d`}
        value={stats.stale}
        icon={TbClock}
        color="yellow"
        tip={`Task open dengan updatedAt > ${STALE_DAYS} hari lalu. Tidak ada pergerakan — mungkin stuck, lupa, atau perlu re-triage.`}
      />
    </SimpleGrid>
  )
}
