import { Badge, Card, Group, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { TbChartLine, TbInfoCircle } from 'react-icons/tb'
import { EChart } from '../../charts/EChart'
import type { UserReportData } from './types'

export function TrendChart({
  trend,
  className,
  renderer,
}: {
  trend: UserReportData['taskTrend']
  className?: string
  renderer?: 'canvas' | 'svg'
}) {
  const option = useMemo<EChartsOption>(() => {
    const dates = trend.map((t) => t.date.slice(5))
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { fontSize: 11 } },
      grid: { left: 36, right: 16, top: 24, bottom: 40 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10, interval: Math.max(0, Math.ceil(dates.length / 10) - 1) },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10 } },
      series: [
        {
          name: 'Created',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2, color: '#228be6' },
          itemStyle: { color: '#228be6' },
          areaStyle: { color: 'rgba(34,139,230,0.12)' },
          data: trend.map((t) => t.created),
        },
        {
          name: 'Closed',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2, color: '#12b886' },
          itemStyle: { color: '#12b886' },
          areaStyle: { color: 'rgba(18,184,134,0.12)' },
          data: trend.map((t) => t.closed),
        },
      ],
    }
  }, [trend])

  const totalCreated = trend.reduce((n, t) => n + t.created, 0)
  const totalClosed = trend.reduce((n, t) => n + t.closed, 0)
  const hasData = totalCreated + totalClosed > 0

  return (
    <Card withBorder padding="md" radius="md" className={className}>
      <Group gap="xs" justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="md" radius="md">
            <TbChartLine size={16} />
          </ThemeIcon>
          <Title order={5}>Task trend</Title>
          <Tooltip multiline w={320} withArrow label="Created vs Closed harian untuk user ini, N hari terakhir.">
            <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
              <TbInfoCircle size={14} />
            </ThemeIcon>
          </Tooltip>
          <Text size="xs" c="dimmed">last {trend.length} days</Text>
        </Group>
        <Group gap="xs">
          <Badge size="xs" variant="light" color="blue">{totalCreated} created</Badge>
          <Badge size="xs" variant="light" color="teal">{totalClosed} closed</Badge>
        </Group>
      </Group>
      {hasData ? (
        <EChart option={option} height={200} renderer={renderer} />
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="lg">Belum ada aktivitas task di window ini.</Text>
      )}
    </Card>
  )
}
