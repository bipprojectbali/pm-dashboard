import { ActionIcon, Alert, Group, SegmentedControl, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { useMemo, useState } from 'react'
import { TbCheck, TbClock, TbInfoCircle, TbListCheck, TbRefresh, TbTarget } from 'react-icons/tb'
import { EChart } from '../charts/EChart'
import { InfoTip } from '../shared/InfoTip'
import { ChartCard } from './analyticspanel/ChartCard'
import { GanttSection } from './analyticspanel/GanttSection'
import { StatCard } from './analyticspanel/StatCard'
import { buildHeatmapOption, buildStatusOption, buildTrendOption } from './analyticspanel/chartBuilders.overview'
import {
  buildAgingWipOption,
  buildContributorsOption,
  buildCycleBucketsOption,
  buildProjectWipOption,
} from './analyticspanel/chartBuilders.tasks'
import { WINDOW_OPTIONS, startOfDay } from './analyticspanel/constants'
import type { AnalyticsProject, AnalyticsTask, OverviewAnalytics } from './analyticspanel/types'
import { useAnalyticsTimeline } from './analyticspanel/useAnalyticsTimeline'

// The per-task charts (contributors, cycle time, aging WIP, WIP-per-project)
// pull the task list, which the server hard-caps at 200. Stat cards do NOT rely
// on this — Task Terbuka / Ditutup / Proyek Aktif come from the server-side
// /overview/analytics aggregate (uncapped, IDEA-excluded), so they stay correct
// past the cap. The banner surfaces any overflow instead of hiding it silently.
const TABLE_FETCH_LIMIT = 200

export function AnalyticsPanel() {
  const [windowDays, setWindowDays] = useState<'7' | '30' | '90'>('30')
  const days = Number(windowDays)

  const { data: overviewData, isFetching: overviewFetching, refetch: refetchOverview } = useQuery({
    queryKey: ['admin', 'analytics', 'overview', days],
    queryFn: () =>
      fetch(`/api/admin/overview/analytics?trendDays=${days}&timelineLimit=12`, {
        credentials: 'include',
      }).then((r) => r.json()) as Promise<OverviewAnalytics>,
  })

  const { data: tasksData, isFetching: tasksFetching, refetch: refetchTasks } = useQuery({
    queryKey: ['admin', 'analytics', 'tasks'],
    queryFn: () =>
      fetch(`/api/tasks?limit=${TABLE_FETCH_LIMIT}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        tasks: AnalyticsTask[]
        total: number
      }>,
  })

  const { data: projectsData, isFetching: projectsFetching, refetch: refetchProjects } = useQuery({
    queryKey: ['admin', 'analytics', 'projects'],
    queryFn: () =>
      fetch('/api/projects', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        projects: AnalyticsProject[]
      }>,
  })

  // Exclude IDEA from the per-task charts so they agree with the server-side
  // aggregate (taskTrend/tasksByStatus already drop IDEA via WORKLOAD_KIND_FILTER).
  const tasks = useMemo(() => (tasksData?.tasks ?? []).filter((t) => t.kind !== 'IDEA'), [tasksData])
  const serverTotal = tasksData?.total ?? 0
  const truncated = (tasksData?.tasks.length ?? 0) >= TABLE_FETCH_LIMIT && serverTotal > TABLE_FETCH_LIMIT
  const projects = projectsData?.projects ?? []

  const windowStartMs = useMemo(() => {
    const d = startOfDay(new Date())
    d.setDate(d.getDate() - (days - 1))
    return d.getTime()
  }, [days])

  const stats = useMemo(() => {
    // Server-accurate (uncapped, IDEA-excluded): read straight off the aggregate.
    const byStatus = overviewData?.tasksByStatus ?? {}
    const openTasks = Object.entries(byStatus)
      .filter(([status]) => status !== 'CLOSED')
      .reduce((sum, [, n]) => sum + (n ?? 0), 0)
    // Ditutup dalam window = Σ taskTrend.closed (exactly the selected window, uncapped).
    const closedInWindow = (overviewData?.taskTrend ?? []).reduce((sum, d) => sum + d.closed, 0)
    const activeProjects = overviewData?.projectsByStatus?.ACTIVE ?? projects.filter((p) => p.status === 'ACTIVE').length
    // Avg cycle needs per-task start/close pairs, so it stays client-side over the
    // capped list (the truncation banner flags when it's computed from a subset).
    const cycleDays = tasks
      .filter((t) => t.closedAt && new Date(t.closedAt).getTime() >= windowStartMs)
      .map((t) => {
        const start = new Date(t.startsAt ?? t.createdAt).getTime()
        const end = new Date(t.closedAt as string).getTime()
        return (end - start) / (1000 * 60 * 60 * 24)
      })
      .filter((x) => Number.isFinite(x) && x >= 0)
    const avgCycle = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0
    return {
      activeProjects,
      openTasks,
      closedInWindow,
      avgCycleDays: Math.round(avgCycle * 10) / 10,
    }
  }, [overviewData, projects, tasks, windowStartMs])

  const trendOption = useMemo<EChartsOption>(
    () => buildTrendOption(overviewData?.taskTrend ?? []),
    [overviewData],
  )
  const statusOption = useMemo<EChartsOption>(
    () => buildStatusOption(overviewData?.tasksByStatus ?? {}),
    [overviewData],
  )
  const throughputHeatmapOption = useMemo<EChartsOption>(
    () => buildHeatmapOption(overviewData?.taskTrend ?? []),
    [overviewData],
  )
  const contributorsOption = useMemo<EChartsOption>(
    () => buildContributorsOption(tasks, windowStartMs),
    [tasks, windowStartMs],
  )
  const projectWipOption = useMemo<EChartsOption>(() => buildProjectWipOption(tasks), [tasks])
  const cycleBucketsOption = useMemo<EChartsOption>(
    () => buildCycleBucketsOption(tasks, windowStartMs),
    [tasks, windowStartMs],
  )
  const agingWipOption = useMemo<EChartsOption>(() => buildAgingWipOption(tasks), [tasks])

  const { timelineTasks, timelineRows, tlStart, tlEnd, tlWrapperRef, scrollToToday } =
    useAnalyticsTimeline(overviewData)

  const refetchAll = () => { refetchOverview(); refetchTasks(); refetchProjects() }
  const isFetching = overviewFetching || tasksFetching || projectsFetching

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Group gap="xs">
            <Title order={3}>Analitik</Title>
            <InfoTip
              width={380}
              label="Dashboard metrik portfolio-wide: throughput (create vs close), distribusi status, cycle time, aging WIP, timeline project. Semua mengecualikan IDEA. Kartu Proyek Aktif / Task Terbuka / Ditutup + throughput, status, heatmap di-agregat di server (akurat penuh). Chart per-task (kontributor, cycle time, aging/WIP) dan Avg Cycle dihitung dari 200 task terbaru — banner muncul bila ada yang terpotong."
            />
          </Group>
          <Text size="sm" c="dimmed">
            Kartu &amp; trend di-agregat di server (akurat); chart per-task dari 200 task terbaru.
          </Text>
        </div>
        <Group gap="sm">
          <Tooltip label="Rentang waktu untuk trend, heatmap, dan cycle distribution. 7d = 1 minggu, 30d = 1 bulan, 90d = 3 bulan.">
            <SegmentedControl
              size="xs"
              value={windowDays}
              onChange={(v) => setWindowDays(v as '7' | '30' | '90')}
              data={WINDOW_OPTIONS}
            />
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" onClick={refetchAll} loading={isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard label="Proyek Aktif" value={stats.activeProjects.toString()} icon={TbTarget} color="blue"
          tip="Jumlah project dengan status ACTIVE (dihitung di server). Proyek DRAFT / ON_HOLD / COMPLETED / CANCELLED tidak dihitung." />
        <StatCard label="Task Terbuka" value={stats.openTasks.toString()} icon={TbListCheck} color="violet"
          tip="Task dengan status selain CLOSED (OPEN / IN_PROGRESS / READY_FOR_QC / REOPENED). Dihitung di server — akurat penuh, mengecualikan IDEA." />
        <StatCard label={`Ditutup (${days}h)`} value={stats.closedInWindow.toString()} icon={TbCheck} color="green"
          tip={`Task ditutup dalam ${days} hari terakhir (Σ throughput per hari, dihitung di server — akurat penuh, mengecualikan IDEA). Indikator velocity tim.`} />
        <StatCard label="Avg Cycle" value={stats.avgCycleDays > 0 ? `${stats.avgCycleDays}h` : '—'} icon={TbClock} color="orange"
          tip="Rata-rata durasi (hari) antara startsAt dan closedAt untuk task CLOSED. Dihitung dari 200 task terbaru (lihat banner bila terpotong). Semakin kecil = tim lebih responsif." />
      </SimpleGrid>

      {truncated && (
        <Alert color="yellow" variant="light" icon={<TbInfoCircle size={16} />} py="xs">
          <Text size="xs">
            Chart per-task (Kontributor, Distribusi Cycle Time, Aging WIP, WIP per Proyek) &amp; Avg Cycle dihitung dari
            200 task terbaru dari {serverTotal} total — kartu Proyek Aktif / Task Terbuka / Ditutup dan chart Throughput
            / Status / Heatmap tetap akurat penuh (di-agregat di server).
          </Text>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ChartCard title="Throughput" subtitle={`Dibuka vs ditutup, ${days} hari terakhir`}
          tip="Jumlah task dibuka (biru) vs ditutup (hijau) per hari. Line sejajar = velocity sustainable; create >> close = backlog menumpuk.">
          <EChart option={trendOption} height={260} />
        </ChartCard>
        <ChartCard title="Status Task" subtitle="Seluruh task"
          tip="Pie distribusi task per status OPEN / IN_PROGRESS / READY_FOR_QC / REOPENED / CLOSED. Lihat bottleneck: READY_FOR_QC menumpuk = QC lambat, REOPENED banyak = quality issue.">
          <EChart option={statusOption} height={260} />
        </ChartCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ChartCard title="Heatmap Task Ditutup" subtitle={`${days} hari — intensitas per hari`}
          tip="Grid kalender: warna lebih gelap = lebih banyak task ditutup pada hari itu. Deteksi pola kerja mingguan (mis. sprint Jumat) atau blank spot (libur, blocked).">
          <EChart option={throughputHeatmapOption} height={220} />
        </ChartCard>
        <ChartCard title="Distribusi Cycle Time" subtitle={`Task CLOSED di ${days} hari, bucket durasi`}
          tip="Histogram durasi dari startsAt ke closedAt, bucket: ≤1h, 1–3h, 3–7h, 1–2w, 2w–1bln, >1bln. Tail panjang = ada task molor panjang.">
          <EChart option={cycleBucketsOption} height={220} />
        </ChartCard>
      </SimpleGrid>

      <GanttSection
        timelineTasks={timelineTasks}
        timelineRows={timelineRows}
        tlStart={tlStart}
        tlEnd={tlEnd}
        tlWrapperRef={tlWrapperRef}
        onScrollToToday={scrollToToday}
      />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ChartCard title="Aging WIP" subtitle="Task terbuka paling lama tidak bergerak (top 12)"
          tip="Top 12 task non-CLOSED dengan updatedAt terlama. Kandidat kuat untuk ditutup, di-split, atau di-close sebagai wont-fix.">
          <EChart option={agingWipOption} height={320} />
        </ChartCard>
        <ChartCard title="WIP per Proyek" subtitle="Task terbuka per proyek (top 10)"
          tip="Project dengan jumlah task non-CLOSED paling banyak. WIP tinggi = fokus terpecah; pertimbangkan limit WIP per project.">
          <EChart option={projectWipOption} height={320} />
        </ChartCard>
      </SimpleGrid>

      <ChartCard title="Kontributor Teratas" subtitle={`Task ditutup, ${days} hari terakhir (top 10)`}
        tip="User dengan jumlah task CLOSED terbanyak di window. Proxy untuk kontribusi output; bukan ukuran kualitas atau kompleksitas.">
        <EChart option={contributorsOption} height={320} />
      </ChartCard>
    </Stack>
  )
}
