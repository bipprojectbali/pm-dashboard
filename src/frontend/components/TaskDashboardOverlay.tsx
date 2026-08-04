import { Card, SimpleGrid, Stack, Text } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { EChart } from './charts/EChart'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

interface DashboardCharts {
  throughput: Array<{ date: string; created: number; closed: number }>
  statusBreakdown: Record<string, number>
  topAssignees: Array<{ id: string; name: string; count: number }>
}

const STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#7950f2',
  READY_FOR_QC: '#f59f00',
  REOPENED: '#fd7e14',
  CLOSED: '#40c057',
}

export function TaskDashboardOverlay({
  charts,
  stats,
}: {
  // Throughput/Status breakdown/Top assignees — accurate, server-side
  // (GET /api/tasks/dashboard-charts), computed in-DB so they're never capped
  // by the `/api/tasks` 200-row limit.
  charts?: DashboardCharts
  // Total/Open/Closed/Overdue — accurate, server-side (GET /api/tasks/dashboard-stats).
  stats?: { total: number; open: number; closed: number; overdue: number }
}) {
  const { throughput, donut, assignees } = useMemo(() => {
    const rows = charts?.throughput ?? []
    const throughputOpt: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Created', 'Closed'], top: 0, right: 8 },
      grid: { left: 36, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: rows.map((b) => b.date.slice(5)), boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: 'Created',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: '#228be6' },
          data: rows.map((b) => b.created),
        },
        {
          name: 'Closed',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: '#40c057' },
          data: rows.map((b) => b.closed),
        },
      ],
    }

    const statusEntries = Object.entries(charts?.statusBreakdown ?? {}) as [TaskStatus, number][]
    const donutOpt: EChartsOption = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', itemGap: 8 },
      series: [
        {
          type: 'pie',
          radius: ['55%', '78%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          data: statusEntries.map(([s, v]) => ({
            name: s.replace(/_/g, ' '),
            value: v,
            itemStyle: { color: STATUS_HEX[s] },
          })),
        },
      ],
    }

    // Server already returns top-8 desc; reverse so the bar chart's Y axis
    // reads largest-on-top.
    const topAssignees = [...(charts?.topAssignees ?? [])].reverse()
    const assigneesOpt: EChartsOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 90, right: 16, top: 12, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: topAssignees.map((a) => a.name) },
      series: [
        {
          type: 'bar',
          data: topAssignees.map((a) => a.count),
          itemStyle: { color: '#7950f2', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
          label: { show: true, position: 'right', fontSize: 11 },
        },
      ],
    }

    return { throughput: throughputOpt, donut: donutOpt, assignees: assigneesOpt }
  }, [charts])

  const cardStats = stats ?? { total: 0, open: 0, closed: 0, overdue: 0 }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Total
          </Text>
          <Text fw={700} size="xl">
            {cardStats.total}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Open
          </Text>
          <Text fw={700} size="xl" c="blue">
            {cardStats.open}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Closed
          </Text>
          <Text fw={700} size="xl" c="green">
            {cardStats.closed}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Overdue
          </Text>
          <Text fw={700} size="xl" c={cardStats.overdue > 0 ? 'red' : undefined}>
            {cardStats.overdue}
          </Text>
        </Card>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Throughput (last 14 days)
          </Text>
          <EChart option={throughput} height={200} />
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Status breakdown
          </Text>
          <EChart option={donut} height={200} />
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="sm" fw={500} mb={4}>
            Top assignees (open)
          </Text>
          <EChart option={assignees} height={200} />
        </Card>
      </SimpleGrid>
    </Stack>
  )
}
