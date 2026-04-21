import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useMemo, useState } from 'react'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbBrandGithub,
  TbChartBar,
  TbClockHour3,
  TbFileReport,
  TbHeartbeat,
  TbHistory,
  TbListCheck,
  TbPrinter,
  TbRefresh,
  TbTarget,
  TbTimeline,
  TbUsersGroup,
} from 'react-icons/tb'
import { EChart } from '@/frontend/components/charts/EChart'

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

interface ReportPayload {
  window: { since: string; until: string; days: number }
  generatedAt: string
  generatedBy: { email: string }
  kpis: {
    users: { total: number; blocked: number; byRole: Record<string, number> }
    projects: { active: number; byStatus: Record<string, number> }
    tasks: {
      total: number
      byStatus: Record<string, number>
      overdueOpen: number
      staleInProgress: number
      closed7d: number
    }
    agents: { total: number; pending: number; live: number }
    webhooks24h: { total: number; success: number; successRate: number | null; eventsIn: number }
    velocity: { closed7d: number; extensions7d: number }
  }
  health: {
    count: number
    projects: Array<{
      id: string
      name: string
      status: ProjectStatus
      priority: Priority
      owner: string
      endsAt: string | null
      daysUntilDue: number | null
      pastDue: boolean
      openTasks: number
      overdueTasks: number
      blockedTasks: number
      closed7d: number
      extensions: number
      score: number
      grade: Grade
    }>
  }
  risks: {
    severity: 'none' | 'low' | 'medium' | 'high'
    summary: {
      overdueTasks: number
      staleTasks: number
      pastDueProjects: number
      pendingAgents: number
      offlineAgents: number
      missingEnv: number
    }
    overdueTasks: Array<{ id: string; title: string; priority: string; daysOverdue: number | null; project: string }>
    pastDueProjects: Array<{ id: string; name: string; owner: string; daysOverdue: number | null }>
    missingEnv: string[]
  }
  load: {
    count: number
    rows: Array<{
      userId: string | null
      email: string | null
      name: string
      role: string | null
      open: number
      estimateHours: number
      highPriority: number
      overdue: number
      closed7d: number
      overloaded: boolean
    }>
  }
  analytics: {
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
      slipped: boolean
    }>
    taskTrend: Array<{ date: string; created: number; closed: number }>
  }
  priorityGroups: Array<{ priority: Priority; count: number }>
  taskSnapshot: { closedInPeriod: number; createdInPeriod: number; avgHealthScore: number | null }
  github: {
    commits: number
    prsOpened: number
    prsMerged: number
    reviews: number
    byProject: Array<{
      projectId: string
      projectName: string
      repo: string | null
      commits: number
      prsOpened: number
      prsMerged: number
      prsClosed: number
      reviews: number
    }>
  }
  effort: {
    overEstimate: Array<{
      taskId: string
      title: string
      projectName: string
      estimateHours: number | null
      actualHours: number
      variancePercent: number | null
    }>
    underEstimate: Array<{
      taskId: string
      title: string
      projectName: string
      estimateHours: number | null
      actualHours: number
      variancePercent: number | null
    }>
    totalAnalyzed: number
  }
  audit: Array<{
    id: string
    action: string
    detail: string | null
    ip: string | null
    createdAt: string
    userEmail: string | null
    userName: string | null
  }>
}

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

const PRIORITY_HEX: Record<Priority, string> = {
  LOW: '#868e96',
  MEDIUM: '#228be6',
  HIGH: '#fd7e14',
  CRITICAL: '#fa5252',
}

const GRADE_COLOR: Record<Grade, string> = {
  A: 'teal',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  E: 'red',
  F: 'red',
}

const PROJECT_STATUS_HEX: Record<ProjectStatus, string> = {
  DRAFT: '#868e96',
  ACTIVE: '#12b886',
  ON_HOLD: '#fd7e14',
  COMPLETED: '#228be6',
  CANCELLED: '#495057',
}

const TASK_STATUS_HEX: Record<TaskStatus, string> = {
  OPEN: '#228be6',
  IN_PROGRESS: '#fd7e14',
  READY_FOR_QC: '#9775fa',
  REOPENED: '#fa5252',
  CLOSED: '#12b886',
}

const SEVERITY_COLOR: Record<string, string> = {
  none: 'teal',
  low: 'blue',
  medium: 'orange',
  high: 'red',
}

const PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Bulan ini', value: 'month' },
  { label: '30 hari', value: '30d' },
  { label: '90 hari', value: '90d' },
  { label: 'Tahun ini', value: 'ytd' },
]

function resolveRange(preset: string): { since: Date; until: Date } {
  const now = new Date()
  const until = now
  if (preset === '30d') return { since: new Date(now.getTime() - 30 * 86_400_000), until }
  if (preset === '90d') return { since: new Date(now.getTime() - 90 * 86_400_000), until }
  if (preset === 'ytd') return { since: new Date(now.getFullYear(), 0, 1), until }
  return { since: new Date(now.getFullYear(), now.getMonth(), 1), until }
}

function fmtDate(d: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtRange(since: string, until: string): string {
  return `${fmtDate(since)} — ${fmtDate(until)}`
}

interface ReportSearch {
  preset?: string
}

export const Route = createFileRoute('/admin_/report')({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    preset: search.preset != null ? String(search.preset) : undefined,
  }),
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (data.user.role !== 'ADMIN' && data.user.role !== 'SUPER_ADMIN') {
        throw redirect({ to: '/pm', search: { tab: 'overview' } })
      }
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: ReportPage,
})

function ReportPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [preset, setPreset] = useState<string>(search.preset ?? 'month')
  const [pdfState, setPdfState] = useState<{ busy: boolean; progress?: { done: number; total: number }; error?: string }>({
    busy: false,
  })

  const { since, until } = useMemo(() => resolveRange(preset), [preset])

  const q = useQuery({
    queryKey: ['admin', 'report', preset],
    queryFn: () =>
      fetch(`/api/admin/report?since=${since.toISOString()}&until=${until.toISOString()}`, {
        credentials: 'include',
      }).then((r) => r.json()) as Promise<ReportPayload>,
  })

  // Capture the page in-place as a screenshot — whatever theme the user is in.
  // Each .page-section is converted to PNG and packed one-per-A4-page.
  const handlePrint = async () => {
    if (pdfState.busy) return
    const root = document.querySelector<HTMLElement>('.report-root')
    if (!root) return
    setPdfState({ busy: true, progress: { done: 0, total: 0 } })
    try {
      const { generateReportPdf } = await import('@/frontend/lib/report-pdf')
      const filename = `portfolio-report-${preset}-${new Date().toISOString().slice(0, 10)}.pdf`
      await generateReportPdf(root, filename, (done, total) =>
        setPdfState({ busy: true, progress: { done, total } }),
      )
      setPdfState({ busy: false })
    } catch (err) {
      setPdfState({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="report-root">
      <div
        data-html2canvas-ignore="true"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--mantine-color-body)',
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Container size="xl" py="sm">
          <Group justify="space-between">
            <Group gap="xs">
              <ActionIcon
                variant="subtle"
                onClick={() => navigate({ to: '/admin', search: { tab: 'overview' } })}
              >
                <TbArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon variant="light" color="violet" size="md" radius="md">
                <TbFileReport size={18} />
              </ThemeIcon>
              <Text fw={600}>Laporan Portfolio</Text>
            </Group>
            <Group gap="sm">
              <SegmentedControl size="xs" value={preset} onChange={setPreset} data={PRESETS} />
              <Tooltip label="Refresh">
                <ActionIcon variant="subtle" onClick={() => q.refetch()} loading={q.isFetching}>
                  <TbRefresh size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Simpan halaman ini sebagai PDF (screenshot)">
                <Button
                  leftSection={<TbPrinter size={16} />}
                  size="xs"
                  variant="filled"
                  color="violet"
                  onClick={handlePrint}
                  loading={pdfState.busy}
                  disabled={!q.data || pdfState.busy}
                >
                  Simpan PDF
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </div>

      <Container size="xl" py="lg">
        {q.isLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : q.isError || !q.data ? (
          <Alert color="red" icon={<TbAlertTriangle size={16} />}>
            Gagal memuat laporan. Coba refresh.
          </Alert>
        ) : (
          <ReportContent data={q.data} />
        )}
      </Container>

      <PdfOverlay state={pdfState} />
    </div>
  )
}

function PdfOverlay({
  state,
}: {
  state: { busy: boolean; progress?: { done: number; total: number }; error?: string }
}) {
  if (!state.busy && !state.error) return null
  return (
    <div
      data-html2canvas-ignore="true"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        minWidth: 220,
      }}
    >
      {state.error ? (
        <Text size="sm" c="red" fw={600}>
          Gagal membuat PDF: {state.error}
        </Text>
      ) : (
        <Group gap="xs" align="center">
          <Loader size="xs" />
          <Text size="sm" fw={600}>
            Membuat PDF
            {state.progress && state.progress.total > 0
              ? ` (${state.progress.done}/${state.progress.total})`
              : '…'}
          </Text>
        </Group>
      )}
    </div>
  )
}

function ReportContent({ data }: { data: ReportPayload }) {
  return (
    <Stack gap="xl">
      <CoverSection data={data} />
      <ExecutiveSummary data={data} />
      <HealthGridSection data={data} />
      <RiskRadarSection data={data} />
      <TimelineSection data={data} />
      <DistributionSection data={data} />
      <VelocityTrendSection data={data} />
      <TeamLoadSection data={data} />
      <EffortVarianceSection data={data} />
      <GithubActivitySection data={data} />
      <AuditHighlightsSection data={data} />
      <FooterSection data={data} />
    </Stack>
  )
}

function CoverSection({ data }: { data: ReportPayload }) {
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

function ExecutiveSummary({ data }: { data: ReportPayload }) {
  const k = data.kpis
  const openTasks = k.tasks.total - (k.tasks.byStatus.CLOSED ?? 0)
  const items: Array<{ label: string; value: string | number; sub?: string; color: string; icon: typeof TbUsersGroup }> = [
    { label: 'Total Pengguna', value: k.users.total, sub: `${k.users.blocked} diblokir`, color: 'violet', icon: TbUsersGroup },
    { label: 'Proyek Aktif', value: k.projects.active, sub: `dari ${Object.values(k.projects.byStatus).reduce((a, b) => a + b, 0)} total`, color: 'blue', icon: TbTarget },
    { label: 'Task Terbuka', value: openTasks, sub: `${k.tasks.overdueOpen} overdue`, color: 'red', icon: TbListCheck },
    { label: 'Agent Live', value: k.agents.live, sub: `${k.agents.pending} pending`, color: 'teal', icon: TbHeartbeat },
    { label: 'Task Selesai (periode)', value: data.taskSnapshot.closedInPeriod, sub: `${data.taskSnapshot.createdInPeriod} dibuat`, color: 'green', icon: TbListCheck },
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

function HealthGridSection({ data }: { data: ReportPayload }) {
  const projects = data.health.projects.slice(0, 12)
  if (projects.length === 0) {
    return (
      <Card withBorder padding="md" radius="md" className="page-section">
        <SectionHeader icon={TbHeartbeat} color="teal" title="Kesehatan Proyek" subtitle="Skor A–F per proyek" />
        <Text size="sm" c="dimmed">
          Belum ada proyek untuk dinilai.
        </Text>
      </Card>
    )
  }
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbHeartbeat}
        color="teal"
        title="Kesehatan Proyek"
        subtitle={`${data.health.count} proyek · diurutkan dari terendah`}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm" mt="sm">
        {projects.map((p) => (
          <Card key={p.id} withBorder padding="sm" radius="md">
            <Group justify="space-between" mb={4}>
              <Badge color={GRADE_COLOR[p.grade]} variant="filled" size="lg">
                {p.grade}
              </Badge>
              <Badge size="xs" color={PRIORITY_COLOR[p.priority]} variant="light">
                {p.priority}
              </Badge>
            </Group>
            <Text fw={600} size="sm" truncate>
              {p.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {p.owner}
            </Text>
            <Progress value={p.score} color={GRADE_COLOR[p.grade]} size="sm" mt="xs" />
            <Group gap="xs" mt={6} wrap="nowrap">
              <Text size="xs" c="dimmed">
                open: <b>{p.openTasks}</b>
              </Text>
              {p.overdueTasks > 0 && (
                <Text size="xs" c="red">
                  overdue: <b>{p.overdueTasks}</b>
                </Text>
              )}
              {p.blockedTasks > 0 && (
                <Text size="xs" c="orange">
                  blocked: <b>{p.blockedTasks}</b>
                </Text>
              )}
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Card>
  )
}

function RiskRadarSection({ data }: { data: ReportPayload }) {
  const r = data.risks
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" color="red" size="md" radius="md">
            <TbAlertTriangle size={16} />
          </ThemeIcon>
          <div>
            <Title order={4}>Radar Risiko</Title>
            <Text size="xs" c="dimmed">
              Overdue, stale, pending agent, env hilang
            </Text>
          </div>
        </Group>
        <Badge color={SEVERITY_COLOR[r.severity]} variant="filled" size="lg" tt="uppercase">
          {r.severity}
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs" mb="md">
        <RiskStat label="Task Overdue" value={r.summary.overdueTasks} color="red" />
        <RiskStat label="Task Stale" value={r.summary.staleTasks} color="orange" />
        <RiskStat label="Proyek Lewat" value={r.summary.pastDueProjects} color="red" />
        <RiskStat label="Agent Pending" value={r.summary.pendingAgents} color="yellow" />
        <RiskStat label="Agent Offline" value={r.summary.offlineAgents} color="gray" />
        <RiskStat label="Env Hilang" value={r.summary.missingEnv} color="red" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
            Task Overdue (top 5)
          </Text>
          {r.overdueTasks.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Stack gap={4}>
              {r.overdueTasks.slice(0, 5).map((t) => (
                <Group key={t.id} gap="xs" wrap="nowrap">
                  <Badge size="xs" color={PRIORITY_COLOR[t.priority as Priority] ?? 'gray'} variant="outline">
                    {t.priority}
                  </Badge>
                  <Text size="xs" style={{ flex: 1 }} truncate>
                    {t.title} <Text span c="dimmed">({t.project})</Text>
                  </Text>
                  <Text size="xs" c="red">
                    {t.daysOverdue ?? 0}d
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </div>
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
            Proyek Past-Due
          </Text>
          {r.pastDueProjects.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Stack gap={4}>
              {r.pastDueProjects.slice(0, 5).map((p) => (
                <Group key={p.id} gap="xs" wrap="nowrap">
                  <Text size="xs" style={{ flex: 1 }} truncate>
                    {p.name} <Text span c="dimmed">({p.owner})</Text>
                  </Text>
                  <Text size="xs" c="red">
                    {p.daysOverdue ?? 0}d
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
          {r.missingEnv.length > 0 && (
            <Alert color="red" mt="sm" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">
                Env vars hilang: <b>{r.missingEnv.join(', ')}</b>
              </Text>
            </Alert>
          )}
        </div>
      </SimpleGrid>
    </Card>
  )
}

function RiskStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card withBorder padding="xs" radius="md" bg="var(--mantine-color-default-hover)">
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        {label}
      </Text>
      <Text size="xl" fw={700} c={value > 0 ? color : undefined}>
        {value}
      </Text>
    </Card>
  )
}

function TimelineSection({ data }: { data: ReportPayload }) {
  const timeline = data.analytics.timeline.slice(0, 20)
  const option = useMemo<EChartsOption | null>(() => {
    if (timeline.length === 0) return null
    const now = Date.now()
    const rows = timeline.slice().reverse()
    const names = rows.map((p) => p.name)
    const min = rows
      .map((p) => (p.startsAt ? new Date(p.startsAt).getTime() : null))
      .filter((n): n is number => n !== null)
    const max = rows
      .map((p) => (p.endsAt ? new Date(p.endsAt).getTime() : null))
      .filter((n): n is number => n !== null)
    const xMin = min.length > 0 ? Math.min(...min, now) : now - 30 * 86_400_000
    const xMax = max.length > 0 ? Math.max(...max, now) : now + 30 * 86_400_000
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
      <SectionHeader icon={TbTimeline} color="indigo" title="Timeline Portfolio" subtitle="Gantt proyek aktif · warna = priority" />
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

function DistributionSection({ data }: { data: ReportPayload }) {
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
      <SectionHeader icon={TbChartBar} color="grape" title="Distribusi Status & Prioritas" subtitle="Snapshot project, task, priority" />
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mt="sm">
        {projectPie.length > 0 ? <EChart option={buildOption(projectPie, 'Project')} height={220} renderer="svg" /> : <EmptyMini label="Project" />}
        {taskPie.length > 0 ? <EChart option={buildOption(taskPie, 'Task')} height={220} renderer="svg" /> : <EmptyMini label="Task" />}
        {priorityPie.length > 0 ? <EChart option={buildOption(priorityPie, 'Priority Task')} height={220} renderer="svg" /> : <EmptyMini label="Priority" />}
      </SimpleGrid>
    </Card>
  )
}

function EmptyMini({ label }: { label: string }) {
  return (
    <Center h={220}>
      <Text size="xs" c="dimmed">
        {label}: tidak ada data
      </Text>
    </Center>
  )
}

function VelocityTrendSection({ data }: { data: ReportPayload }) {
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

function TeamLoadSection({ data }: { data: ReportPayload }) {
  const rows = data.load.rows.slice(0, 12)
  const maxOpen = rows.reduce((m, r) => Math.max(m, r.open), 0) || 1
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbUsersGroup}
        color="cyan"
        title="Beban Tim"
        subtitle={`${data.load.count} anggota · diurutkan berdasarkan task terbuka`}
      />
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          Belum ada assignment aktif.
        </Text>
      ) : (
        <Stack gap={6} mt="sm">
          {rows.map((r) => {
            const pct = (r.open / maxOpen) * 100
            const color = r.overloaded ? 'red' : r.open > 5 ? 'orange' : 'blue'
            return (
              <div key={r.userId ?? r.email ?? r.name}>
                <Group justify="space-between" mb={2}>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {r.name}
                    </Text>
                    {r.overloaded && (
                      <Badge size="xs" color="red" variant="light">
                        OVERLOAD
                      </Badge>
                    )}
                    {r.role && (
                      <Text size="xs" c="dimmed">
                        {r.role}
                      </Text>
                    )}
                  </Group>
                  <Group gap="sm">
                    <Text size="xs" c="dimmed">
                      {r.open} open
                    </Text>
                    {r.overdue > 0 && (
                      <Text size="xs" c="red">
                        {r.overdue} overdue
                      </Text>
                    )}
                    {r.estimateHours > 0 && (
                      <Text size="xs" c="dimmed">
                        {r.estimateHours}h est
                      </Text>
                    )}
                    <Text size="xs" c="teal">
                      {r.closed7d} selesai/7d
                    </Text>
                  </Group>
                </Group>
                <Progress value={pct} color={color} size="sm" />
              </div>
            )
          })}
        </Stack>
      )}
    </Card>
  )
}

function EffortVarianceSection({ data }: { data: ReportPayload }) {
  const { overEstimate, underEstimate, totalAnalyzed } = data.effort
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbClockHour3}
        color="orange"
        title="Varian Effort"
        subtitle={`${totalAnalyzed} task dianalisis · estimasi vs aktual`}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="sm">
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="red" mb={6}>
            Overrun (aktual ≫ estimasi)
          </Text>
          {overEstimate.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Table withColumnBorders withTableBorder striped fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th style={{ width: 70 }}>Est.</Table.Th>
                  <Table.Th style={{ width: 70 }}>Aktual</Table.Th>
                  <Table.Th style={{ width: 70 }}>Var</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {overEstimate.map((t) => (
                  <Table.Tr key={t.taskId}>
                    <Table.Td>
                      <Text size="xs" truncate>
                        {t.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.projectName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{t.estimateHours ?? '—'}</Table.Td>
                    <Table.Td>{t.actualHours}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="red" fw={600}>
                        +{t.variancePercent ?? 0}%
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
        <div>
          <Text size="xs" fw={600} tt="uppercase" c="teal" mb={6}>
            Underrun (aktual ≪ estimasi)
          </Text>
          {underEstimate.length === 0 ? (
            <Text size="xs" c="dimmed">
              Tidak ada.
            </Text>
          ) : (
            <Table withColumnBorders withTableBorder striped fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th style={{ width: 70 }}>Est.</Table.Th>
                  <Table.Th style={{ width: 70 }}>Aktual</Table.Th>
                  <Table.Th style={{ width: 70 }}>Var</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {underEstimate.map((t) => (
                  <Table.Tr key={t.taskId}>
                    <Table.Td>
                      <Text size="xs" truncate>
                        {t.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.projectName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{t.estimateHours ?? '—'}</Table.Td>
                    <Table.Td>{t.actualHours}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c="teal" fw={600}>
                        {t.variancePercent ?? 0}%
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      </SimpleGrid>
    </Card>
  )
}

function GithubActivitySection({ data }: { data: ReportPayload }) {
  const g = data.github
  const total = g.commits + g.prsOpened + g.prsMerged + g.reviews
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader
        icon={TbBrandGithub}
        color="dark"
        title="Aktivitas GitHub"
        subtitle={`Periode berjalan · ${total} event`}
      />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs" mt="sm" mb="md">
        <RiskStat label="Commits" value={g.commits} color="blue" />
        <RiskStat label="PR Dibuka" value={g.prsOpened} color="teal" />
        <RiskStat label="PR Merged" value={g.prsMerged} color="violet" />
        <RiskStat label="Review" value={g.reviews} color="orange" />
      </SimpleGrid>
      {g.byProject.length === 0 ? (
        <Text size="sm" c="dimmed">
          Belum ada aktivitas GitHub di periode ini.
        </Text>
      ) : (
        <Table withColumnBorders withTableBorder striped fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Proyek</Table.Th>
              <Table.Th>Repo</Table.Th>
              <Table.Th style={{ width: 80 }}>Commits</Table.Th>
              <Table.Th style={{ width: 80 }}>PR Open</Table.Th>
              <Table.Th style={{ width: 80 }}>PR Merged</Table.Th>
              <Table.Th style={{ width: 80 }}>Review</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {g.byProject.slice(0, 15).map((p) => (
              <Table.Tr key={p.projectId}>
                <Table.Td>{p.projectName}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.repo ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>{p.commits}</Table.Td>
                <Table.Td>{p.prsOpened}</Table.Td>
                <Table.Td>{p.prsMerged}</Table.Td>
                <Table.Td>{p.reviews}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

function AuditHighlightsSection({ data }: { data: ReportPayload }) {
  return (
    <Card withBorder padding="md" radius="md" className="page-section">
      <SectionHeader icon={TbHistory} color="gray" title="Highlight Audit" subtitle={`${data.audit.length} event terbaru non-login`} />
      {data.audit.length === 0 ? (
        <Text size="sm" c="dimmed">
          Tidak ada aktivitas audit di periode ini.
        </Text>
      ) : (
        <Table withColumnBorders withTableBorder striped fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 150 }}>Waktu</Table.Th>
              <Table.Th style={{ width: 180 }}>Aksi</Table.Th>
              <Table.Th>Detail</Table.Th>
              <Table.Th style={{ width: 200 }}>Oleh</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.audit.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(a.createdAt).toLocaleString('id-ID')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light">
                    {a.action}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" truncate>
                    {a.detail ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{a.userName ?? a.userEmail ?? '—'}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

function FooterSection({ data }: { data: ReportPayload }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <Text size="xs" c="dimmed">
        Dibuat otomatis oleh pm-dashboard · {new Date(data.generatedAt).toLocaleString('id-ID')} · {data.generatedBy.email}
      </Text>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  color,
  title,
  subtitle,
}: {
  icon: typeof TbFileReport
  color: string
  title: string
  subtitle?: string
}) {
  return (
    <Group gap="xs" mb={4}>
      <ThemeIcon variant="light" color={color} size="md" radius="md">
        <Icon size={16} />
      </ThemeIcon>
      <div>
        <Title order={4}>{title}</Title>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </div>
    </Group>
  )
}

