import { ActionIcon, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { TbX } from 'react-icons/tb'
import { SectionSkeleton } from '@/frontend/components/shared/LoadingState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { BreakdownDonuts } from './userreportpanel/BreakdownDonuts'
import { EffortCard } from './userreportpanel/EffortCard'
import { KpiRow } from './userreportpanel/KpiRow'
import { OverdueList } from './userreportpanel/OverdueList'
import { TrendChart } from './userreportpanel/TrendChart'
import type { UserReportData } from './userreportpanel/types'

export function UserReportPanel({ userId, onClear }: { userId: string; onClear: () => void }) {
  const navigate = useNavigate()

  const reportQ = useQuery({
    queryKey: ['admin', 'overview', 'user-report', userId],
    queryFn: () =>
      fetch(`/api/admin/overview/user-report?userId=${userId}`, { credentials: 'include' }).then((r) =>
        r.json(),
      ) as Promise<UserReportData>,
    refetchInterval: 60_000,
  })

  const data = reportQ.data

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="sm">
          <UserAvatar name={data?.user.name} image={data?.user.image} size={40} color="blue" />
          <div>
            <Title order={4}>{reportQ.isLoading ? 'Memuat…' : (data?.user.name ?? 'User')}</Title>
            <Text c="dimmed" size="sm">
              {data?.user.email}
            </Text>
          </div>
        </Group>
        <Tooltip label="Kembali ke ringkasan semua user">
          <ActionIcon variant="subtle" onClick={onClear}>
            <TbX size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {reportQ.isLoading ? <SectionSkeleton height={120} /> : <KpiRow data={data} loading={reportQ.isLoading} />}

      {reportQ.isLoading ? <SectionSkeleton height={100} /> : data && <EffortCard effort={data.effort} />}

      {reportQ.isLoading ? (
        <SectionSkeleton height={220} />
      ) : (
        data && <BreakdownDonuts byStatus={data.byStatus} byPriority={data.byPriority} />
      )}

      {reportQ.isLoading ? <SectionSkeleton height={220} /> : data && <TrendChart trend={data.taskTrend} />}

      {reportQ.isLoading ? (
        <SectionSkeleton height={160} />
      ) : (
        data && <OverdueList tasks={data.overdueTasks} navigate={navigate} />
      )}
    </Stack>
  )
}
