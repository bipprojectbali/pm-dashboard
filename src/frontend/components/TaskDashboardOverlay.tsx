import { Card, SimpleGrid, Stack, Text } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { EChart } from './charts/EChart'

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

interface TaskUser {
  id: string
  name: string
  email: string
  role: string
}

interface TaskTag {
  tagId: string
  tag: { id: string; name: string; color: string; projectId: string }
}

type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskKind = 'TASK' | 'BUG' | 'QC'

interface TaskListItem {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  route: string | null
  reporter: TaskUser
  assignee: TaskUser | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  actualHours: number | null
  progressPercent: number | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  project: { id: string; name: string }
  tags: TaskTag[]
  _count: { comments: number; evidence: number; blockedBy: number; blocks: number }
}

const STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#7950f2',
  READY_FOR_QC: '#f59f00',
  REOPENED: '#fd7e14',
  CLOSED: '#40c057',
}

export function TaskDashboardOverlay({ tasks }: { tasks: TaskListItem[] }) {
  const { throughput, donut, assignees, stats } = useMemo(() => {
    const days = 14
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const buckets: { date: string; created: number; closed: number }[] = []
    const keyToIdx = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      keyToIdx.set(key, buckets.length)
      buckets.push({ date: key, created: 0, closed: 0 })
    }
    const byStatus = new Map<TaskStatus, number>()
    const byAssignee = new Map<string, { name: string; count: number }>()

    for (const t of tasks) {
      byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1)
      const ck = t.createdAt.slice(0, 10)
      const ci = keyToIdx.get(ck)
      if (ci !== undefined) buckets[ci].created += 1
      if (t.closedAt) {
        const xk = t.closedAt.slice(0, 10)
        const xi = keyToIdx.get(xk)
        if (xi !== undefined) buckets[xi].closed += 1
      }
      if (t.status !== 'CLOSED' && t.assignee) {
        const existing = byAssignee.get(t.assignee.id)
        if (existing) existing.count += 1
        else byAssignee.set(t.assignee.id, { name: t.assignee.name, count: 1 })
      }
    }

    const throughputOpt: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Created', 'Closed'], top: 0, right: 8 },
      grid: { left: 36, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'category', data: buckets.map((b) => b.date.slice(5)), boundaryGap: false },
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
          data: buckets.map((b) => b.created),
        },
        {
          name: 'Closed',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: '#40c057' },
          data: buckets.map((b) => b.closed),
        },
      ],
    }

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
          data: (Array.from(byStatus.entries()) as [TaskStatus, number][]).map(([s, v]) => ({
            name: s.replace('_', ' '),
            value: v,
            itemStyle: { color: STATUS_HEX[s] },
          })),
        },
      ],
    }

    const topAssignees = Array.from(byAssignee.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .reverse()

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

    const openCount = tasks.filter((t) => t.status !== 'CLOSED').length
    const closedCount = tasks.length - openCount
    const overdueCount = tasks.filter(
      (t) => t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt).getTime() < today.getTime(),
    ).length

    return {
      throughput: throughputOpt,
      donut: donutOpt,
      assignees: assigneesOpt,
      stats: { total: tasks.length, open: openCount, closed: closedCount, overdue: overdueCount },
    }
  }, [tasks])

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Total
          </Text>
          <Text fw={700} size="xl">
            {stats.total}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Open
          </Text>
          <Text fw={700} size="xl" c="blue">
            {stats.open}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Closed
          </Text>
          <Text fw={700} size="xl" c="green">
            {stats.closed}
          </Text>
        </Card>
        <Card withBorder padding="sm" radius="md">
          <Text size="xs" c="dimmed">
            Overdue
          </Text>
          <Text fw={700} size="xl" c={stats.overdue > 0 ? 'red' : undefined}>
            {stats.overdue}
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
