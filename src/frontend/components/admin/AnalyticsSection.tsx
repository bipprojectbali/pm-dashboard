import { ActionIcon, Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TbCalendarEvent, TbChartDonut, TbChartLine, TbInfoCircle, TbTimeline } from 'react-icons/tb'
import { EChart } from '../charts/EChart'
import { Gantt, type GanttTask } from 'mantine-gantt'

type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface AnalyticsData {
  timestamp: string
  projectsByStatus: Partial<Record<ProjectStatus, number>>
  tasksByStatus: Partial<Record<TaskStatus, number>>
  timeline: Array<{
    id: string
    name: string
    status: ProjectStatus
    priority: Priority
    owner: string
    startsAt: string | null
    endsAt: string | null
    originalEndAt: string | null
    slipped: boolean
  }>
  deadlineGroups: {
    endingSoon: DeadlineFuture[]
    endingMonth: DeadlineFuture[]
    pastDue: DeadlinePast[]
  }
  taskTrend: Array<{ date: string; created: number; closed: number }>
}

interface DeadlineFuture {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  owner: string
  endsAt: string | null
  daysUntil: number | null
}

interface DeadlinePast {
  id: string
  name: string
  status: ProjectStatus
  priority: Priority
  owner: string
  endsAt: string | null
  daysOverdue: number | null
}

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: '#868e96',
  MEDIUM: '#228be6',
  HIGH: '#fd7e14',
  CRITICAL: '#fa5252',
}

const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  DRAFT: '#868e96',
  ACTIVE: '#12b886',
  ON_HOLD: '#fd7e14',
  COMPLETED: '#228be6',
  CANCELLED: '#495057',
}

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#fd7e14',
  READY_FOR_QC: '#9775fa',
  REOPENED: '#fa5252',
  CLOSED: '#12b886',
}

export function AnalyticsSection({ data }: { data: AnalyticsData }) {
  return (
    <Stack gap="md">
      <TimelineBlock timeline={data.timeline} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <StatusDonuts projectsByStatus={data.projectsByStatus} tasksByStatus={data.tasksByStatus} />
        <TaskTrendBlock trend={data.taskTrend} />
      </SimpleGrid>
      <DeadlineGroupsBlock groups={data.deadlineGroups} />
    </Stack>
  )
}

const PROJ_STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'blue', ON_HOLD: 'yellow', DRAFT: 'gray', COMPLETED: 'green', CANCELLED: 'dark',
}

const PROJ_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', ON_HOLD: 'On Hold', DRAFT: 'Draft', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const TIMELINE_COL_WIDTH = 22
const TIMELINE_ROW_H = 42
// mantine-gantt divides columnWidth by 6 for month view, by 2 for week view
// We must use the same effective per-day width for scroll calculation
const TIMELINE_EFFECTIVE_DAY_PX = Math.max(TIMELINE_COL_WIDTH / 6, 7)

function TimelineBlock({ timeline }: { timeline: AnalyticsData['timeline'] }) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const ganttTasks = useMemo<GanttTask[]>(() => {
    const now = new Date()
    const weekOut = new Date(Date.now() + 7 * 86_400_000)
    return timeline
      .filter((p) => p.startsAt || p.endsAt)
      .map((p) => {
        const start = p.startsAt ? new Date(p.startsAt) : now
        const end = p.endsAt ? new Date(p.endsAt) : weekOut
        const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
        const suffix = [
          PROJ_STATUS_LABEL[p.status] ?? p.status,
          p.owner,
          p.slipped ? '⚠ slipped' : '',
        ].filter(Boolean).join(' · ')
        return {
          id: p.id,
          label: `${p.name}  —  ${suffix}`,
          startDate: start.toISOString().slice(0, 10),
          duration,
          progress: 0,
          color: p.slipped ? '#b86d2a' : (PROJ_STATUS_COLOR[p.status] ?? '#4a7abf'),
        }
      })
  }, [timeline])

  const { tlStart, tlEnd } = useMemo(() => {
    const allMs = ganttTasks.flatMap((t) => {
      const s = new Date(t.startDate).getTime()
      return [s, s + t.duration * 86_400_000]
    })
    return {
      tlStart: allMs.length ? new Date(Math.min(...allMs) - 7 * 86_400_000) : undefined,
      tlEnd: allMs.length ? new Date(Math.max(...allMs) + 14 * 86_400_000) : undefined,
    }
  }, [ganttTasks])

  const statusesInData = useMemo(() => {
    const seen = new Set<string>()
    for (const p of timeline) seen.add(p.status)
    return Array.from(seen)
  }, [timeline])

  const scrollToToday = useCallback(() => {
    if (!tlStart) return
    const body = wrapperRef.current?.querySelector<HTMLElement>('[class*="timelineBody"]')
    if (!body) return
    const daysSinceStart = Math.floor((Date.now() - tlStart.getTime()) / 86_400_000)
    const todayPx = daysSinceStart * TIMELINE_EFFECTIVE_DAY_PX
    body.scrollTo({ left: Math.max(0, todayPx - body.clientWidth / 2), behavior: 'smooth' })
  }, [tlStart])

  return (
    <Card withBorder padding="md" radius="md">
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap" gap="xs">
        <Group gap="xs">
          <ThemeIcon variant="light" color="indigo" size="md" radius="md">
            <TbTimeline size={16} />
          </ThemeIcon>
          <div>
            <Group gap={6} align="baseline">
              <Title order={5}>Project timeline</Title>
              <Text size="xs" c="dimmed">{ganttTasks.length} projects</Text>
            </Group>
            <Text size="xs" c="dimmed">startsAt → endsAt · read-only</Text>
          </div>
        </Group>
        <Group gap={6} wrap="wrap" align="center">
          {statusesInData.map((s) => (
            <Badge key={s} size="xs" color={PROJ_STATUS_COLOR[s] ?? 'gray'} variant="dot">
              {PROJ_STATUS_LABEL[s] ?? s}
            </Badge>
          ))}
          <Badge size="xs" color="orange" variant="dot">Slipped</Badge>
          {ganttTasks.length > 0 && (
            <Tooltip label="Scroll ke hari ini" withArrow>
              <ActionIcon variant="light" size="sm" color="red" onClick={scrollToToday}>
                <TbCalendarEvent size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {ganttTasks.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">Belum ada project aktif dengan jadwal.</Text>
      ) : (
        <div style={{
          display: 'flex',
          height: Math.max(200, ganttTasks.length * TIMELINE_ROW_H + 60),
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'hidden',
        }}>
          {/* Sidebar nama project */}
          <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--mantine-color-default-border)' }}>
            <div style={{ height: 56, flexShrink: 0, borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', alignItems: 'flex-end', padding: '0 10px 8px' }}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>Proyek</Text>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
              {timeline.filter((p) => p.startsAt || p.endsAt).map((p) => (
                <div key={p.id} style={{ height: TIMELINE_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, borderBottom: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.slipped ? '#b86d2a' : (PROJ_STATUS_COLOR[p.status] ?? '#4a7abf'), flexShrink: 0 }} />
                  <Text size="xs" fw={500} truncate title={p.name}>{p.name}</Text>
                </div>
              ))}
            </div>
          </div>

          {/* Gantt timeline */}
          <div ref={wrapperRef} style={{ flex: 1, overflow: 'hidden' }}>
            <Gantt
              tasks={ganttTasks}
              viewMode="month"
              startDate={tlStart}
              endDate={tlEnd}
              columnWidth={TIMELINE_COL_WIDTH}
              rowHeight={TIMELINE_ROW_H}
              taskListWidth={0}
              showTodayMarker
              showTitle
              styles={{ taskList: { display: 'none' } }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function StatusDonuts({
  projectsByStatus,
  tasksByStatus,
}: {
  projectsByStatus: AnalyticsData['projectsByStatus']
  tasksByStatus: AnalyticsData['tasksByStatus']
}) {
  const projectData = Object.entries(projectsByStatus).map(([status, count]) => ({
    name: status,
    value: count as number,
    itemStyle: { color: PROJECT_STATUS_COLOR[status as ProjectStatus] ?? '#868e96' },
  }))
  const taskData = Object.entries(tasksByStatus).map(([status, count]) => ({
    name: status,
    value: count as number,
    itemStyle: { color: TASK_STATUS_COLOR[status as TaskStatus] ?? '#868e96' },
  }))

  const buildOption = (data: typeof projectData, title: string): EChartsOption => ({
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
        data,
      },
    ],
  })

  const hasProject = projectData.some((d) => d.value > 0)
  const hasTask = taskData.some((d) => d.value > 0)

  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="grape" size="md" radius="md">
          <TbChartDonut size={16} />
        </ThemeIcon>
        <Title order={5}>Status breakdown</Title>
        <Tooltip
          multiline
          w={340}
          withArrow
          label="Dua donut: distribusi Projects (DRAFT/ACTIVE/ON_HOLD/COMPLETED/CANCELLED) dan distribusi Tasks (OPEN/IN_PROGRESS/READY_FOR_QC/REOPENED/CLOSED). Hover segmen untuk jumlah + persentase."
        >
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
      </Group>
      <SimpleGrid cols={2} spacing="xs">
        {hasProject ? (
          <EChart option={buildOption(projectData, 'Projects')} height={200} />
        ) : (
          <EmptyMini label="Projects" />
        )}
        {hasTask ? <EChart option={buildOption(taskData, 'Tasks')} height={200} /> : <EmptyMini label="Tasks" />}
      </SimpleGrid>
    </Card>
  )
}

function EmptyMini({ label }: { label: string }) {
  return (
    <Stack align="center" justify="center" h={200} gap={4}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xs" c="dimmed">
        no data
      </Text>
    </Stack>
  )
}

function TaskTrendBlock({ trend }: { trend: AnalyticsData['taskTrend'] }) {
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
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="md" radius="md">
            <TbChartLine size={16} />
          </ThemeIcon>
          <Title order={5}>Task trend</Title>
          <Tooltip
            multiline
            w={340}
            withArrow
            label="Dua garis harian untuk N hari terakhir: Created (task baru dibuat, biru) vs Closed (task berpindah ke CLOSED, hijau). Closed konsisten di bawah Created berarti backlog tumbuh."
          >
            <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
              <TbInfoCircle size={14} />
            </ThemeIcon>
          </Tooltip>
          <Text size="xs" c="dimmed">
            last {trend.length} days
          </Text>
        </Group>
        <Group gap="xs">
          <Badge size="xs" variant="light" color="blue">
            {totalCreated} created
          </Badge>
          <Badge size="xs" variant="light" color="teal">
            {totalClosed} closed
          </Badge>
        </Group>
      </Group>
      {hasData ? (
        <EChart option={option} height={200} />
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Belum ada aktivitas task di window ini.
        </Text>
      )}
    </Card>
  )
}

function DeadlineGroupsBlock({ groups }: { groups: AnalyticsData['deadlineGroups'] }) {
  const total = groups.endingSoon.length + groups.endingMonth.length + groups.pastDue.length
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="orange" size="md" radius="md">
          <TbCalendarEvent size={16} />
        </ThemeIcon>
        <Title order={5}>Deadline groups</Title>
        <Tooltip
          multiline
          w={340}
          withArrow
          label="Project dikelompokkan berdasarkan endsAt vs hari ini: Past-due (sudah lewat), Ending <7d (deadline dalam 7 hari), Ending 7–30d (bulan ini). Per kolom tampil 6 project teratas dengan badge priority + sisa/lewat hari."
        >
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">
          grouped by endsAt
        </Text>
      </Group>
      {total === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Tidak ada project dengan deadline aktif.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
          <DeadlineColumn title="Past-due" color="red" rows={groups.pastDue} variant="past" />
          <DeadlineColumn title="Ending < 7d" color="orange" rows={groups.endingSoon} variant="future" />
          <DeadlineColumn title="Ending 7–30d" color="blue" rows={groups.endingMonth} variant="future" />
        </SimpleGrid>
      )}
    </Card>
  )
}

function DeadlineColumn({
  title,
  color,
  rows,
  variant,
}: {
  title: string
  color: string
  rows: Array<DeadlineFuture | DeadlinePast>
  variant: 'future' | 'past'
}) {
  return (
    <Stack gap={6}>
      <Group gap="xs" justify="space-between">
        <Text size="xs" fw={500} tt="uppercase" c={color}>
          {title}
        </Text>
        <Badge size="xs" variant="light" color={color}>
          {rows.length}
        </Badge>
      </Group>
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed">
          —
        </Text>
      ) : (
        rows.slice(0, 6).map((p) => {
          const days =
            variant === 'past'
              ? `${(p as DeadlinePast).daysOverdue ?? 0}d past`
              : `${(p as DeadlineFuture).daysUntil ?? 0}d left`
          return (
            <Group key={p.id} gap={4} wrap="nowrap" align="flex-start">
              <Badge size="xs" color={PRIORITY_BADGE[p.priority] ?? 'gray'} variant="outline">
                {p.priority}
              </Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" fw={500} truncate>
                  {p.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {p.owner}
                </Text>
              </div>
              <Text size="xs" c={variant === 'past' ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                {days}
              </Text>
            </Group>
          )
        })
      )}
    </Stack>
  )
}
