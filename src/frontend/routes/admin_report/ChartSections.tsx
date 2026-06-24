import { Card, Center, SimpleGrid, Text } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { TbChartBar, TbTimeline } from 'react-icons/tb'
import { EChart } from '@/frontend/components/charts/EChart'
import { PRIORITY_HEX, PROJECT_STATUS_HEX, TASK_STATUS_HEX } from './constants'
import { SectionHeader } from './shared'
import type { Priority, ProjectStatus, ReportPayload, TaskStatus } from './types'

function EmptyMini({ label }: { label: string }) {
  return (
    <Center h={220}>
      <Text size="xs" c="dimmed">
        {label}: tidak ada data
      </Text>
    </Center>
  )
}

export function TimelineSection({ data }: { data: ReportPayload }) {
  const timeline = data.analytics.timeline.slice(0, 20)
  const option = useMemo<EChartsOption | null>(() => {
    if (timeline.length === 0) return null
    const now = Date.now()
    const rows = timeline.slice().reverse()
    const names = rows.map((p) => p.name)
    const minTs = rows
      .map((p) => (p.startsAt ? new Date(p.startsAt).getTime() : null))
      .filter((n): n is number => n !== null)
    const maxTs = rows
      .map((p) => (p.endsAt ? new Date(p.endsAt).getTime() : null))
      .filter((n): n is number => n !== null)
    const xMin = minTs.length > 0 ? Math.min(...minTs, now) : now - 30 * 86_400_000
    const xMax = maxTs.length > 0 ? Math.max(...maxTs, now) : now + 30 * 86_400_000
    const bars = rows.map((p, idx) => {
      const start = p.startsAt ? new Date(p.startsAt).getTime() : now
      const end = p.endsAt ? new Date(p.endsAt).getTime() : now + 7 * 86_400_000
      return {
        name: p.name,
        value: [idx, start, end],
        itemStyle: { color: PRIORITY_HEX[p.priority], opacity: p.status === 'ON_HOLD' ? 0.45 : 0.9 },
      }
    })
    return {
      grid: { left: 140, right: 30, top: 10, bottom: 30 },
      tooltip: { trigger: 'item' },
      xAxis: { type: 'time', min: xMin, max: xMax, splitLine: { show: true } },
      yAxis: { type: 'category', data: names, axisLabel: { fontSize: 10, width: 130, overflow: 'truncate' } },
      series: [
        {
          type: 'custom',
          renderItem: ((_p: unknown, api: unknown) => {
            const a = api as {
              value: (idx: number) => number
              coord: (pt: [number, number]) => [number, number]
              size: (vals: [number, number]) => [number, number]
            }
            const categoryIdx = a.value(0)
            const startTs = a.value(1)
            const endTs = a.value(2)
            const startPt = a.coord([startTs, categoryIdx])
            const endPt = a.coord([endTs, categoryIdx])
            const height = a.size([0, 1])[1] * 0.55
            return {
              type: 'rect' as const,
              shape: { x: startPt[0], y: startPt[1] - height / 2, width: Math.max(2, endPt[0] - startPt[0]), height },
              style: { fill: (bars[categoryIdx]?.itemStyle as { color: string } | undefined)?.color ?? '#228be6' },
            }
          }) as never,
          encode: { x: [1, 2], y: 0 },
          data: bars,
        },
        {
          type: 'line',
          markLine: {
            symbol: 'none',
            lineStyle: { color: '#fa5252', width: 2, type: 'dashed' },
            label: { formatter: 'hari ini', position: 'insideEndTop', color: '#fa5252', fontSize: 10 },
            data: [{ xAxis: now }],
          },
          data: [],
        },
      ],
    } satisfies EChartsOption
  }, [timeline])

  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbTimeline}
        color="indigo"
        title="Timeline Portfolio"
        subtitle="Gantt proyek aktif · warna = priority"
      />
      {!option ? (
        <Text size="sm" c="dimmed">
          Belum ada proyek aktif dengan jadwal.
        </Text>
      ) : (
        <EChart option={option} height={Math.max(200, timeline.length * 30 + 60)} renderer="svg" />
      )}
    </Card>
  )
}

export function DistributionSection({ data }: { data: ReportPayload }) {
  const projectPie = Object.entries(data.analytics.projectsByStatus).map(([s, v]) => ({
    name: s,
    value: v as number,
    itemStyle: { color: PROJECT_STATUS_HEX[s as ProjectStatus] ?? '#868e96' },
  }))
  const taskPie = Object.entries(data.analytics.tasksByStatus).map(([s, v]) => ({
    name: s,
    value: v as number,
    itemStyle: { color: TASK_STATUS_HEX[s as TaskStatus] ?? '#868e96' },
  }))
  const priorityPie = data.priorityGroups.map((g) => ({
    name: g.priority,
    value: g.count,
    itemStyle: { color: PRIORITY_HEX[g.priority] },
  }))
  const buildOption = (pieData: typeof projectPie, title: string): EChartsOption => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { fontSize: 11 } },
    title: { text: title, left: 'center', top: 6, textStyle: { fontSize: 12, fontWeight: 'normal' } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        data: pieData,
      },
    ],
  })
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbChartBar}
        color="grape"
        title="Distribusi Status & Prioritas"
        subtitle="Snapshot project, task, priority"
      />
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mt="sm">
        {projectPie.length > 0 ? (
          <EChart option={buildOption(projectPie, 'Project')} height={220} renderer="svg" />
        ) : (
          <EmptyMini label="Project" />
        )}
        {taskPie.length > 0 ? (
          <EChart option={buildOption(taskPie, 'Task')} height={220} renderer="svg" />
        ) : (
          <EmptyMini label="Task" />
        )}
        {priorityPie.length > 0 ? (
          <EChart option={buildOption(priorityPie, 'Priority Task')} height={220} renderer="svg" />
        ) : (
          <EmptyMini label="Priority" />
        )}
      </SimpleGrid>
    </Card>
  )
}

export function VelocityTrendSection({ data }: { data: ReportPayload }) {
  const trend = data.analytics.taskTrend
  const option = useMemo<EChartsOption>(() => {
    const dates = trend.map((t) => t.date.slice(5))
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { fontSize: 11 } },
      grid: { left: 40, right: 24, top: 24, bottom: 44 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10, interval: Math.max(0, Math.ceil(dates.length / 12) - 1) },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10 } },
      series: [
        {
          name: 'Dibuat',
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
          name: 'Selesai',
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
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbTimeline}
        color="blue"
        title="Velocity Trend"
        subtitle={`${trend.length} hari · ${totalCreated} dibuat vs ${totalClosed} selesai`}
      />
      {totalCreated + totalClosed === 0 ? (
        <Text size="sm" c="dimmed">
          Belum ada aktivitas task di window ini.
        </Text>
      ) : (
        <EChart option={option} height={240} renderer="svg" />
      )}
    </Card>
  )
}
