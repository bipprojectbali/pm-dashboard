import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { TbAlertTriangle, TbArrowLeft, TbFileReport, TbPrinter, TbRefresh, TbUser } from 'react-icons/tb'
import { BreakdownDonuts } from '@/frontend/components/admin/userreportpanel/BreakdownDonuts'
import { EffortCard } from '@/frontend/components/admin/userreportpanel/EffortCard'
import { OverdueList } from '@/frontend/components/admin/userreportpanel/OverdueList'
import { TrendChart } from '@/frontend/components/admin/userreportpanel/TrendChart'
import { toLocalDateStr } from '@/frontend/lib/dates'
import { AuditHighlightsSection, FooterSection, GithubActivitySection } from './admin_report/ActivitySections'
import { DistributionSection, TimelineSection, VelocityTrendSection } from './admin_report/ChartSections'
import { CoverSection, ExecutiveSummary } from './admin_report/CoverExecutive'
import { PRESETS, resolveRange } from './admin_report/constants'
import { HealthGridSection, RiskRadarSection } from './admin_report/ProjectSections'
import { PdfOverlay } from './admin_report/shared'
import { TeamLoadSection } from './admin_report/TeamEffortSections'
import type { ReportPayload, ReportSearch, UserReportPayload } from './admin_report/types'
import { UserCoverSection, UserExecutiveSummary } from './admin_report/UserReportSections'

interface AdminUserOption {
  id: string
  name: string
  email: string
  blocked: boolean
}

const ALL_USERS_VALUE = '__all__'

export const Route = createFileRoute('/admin_/report')({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    preset: search.preset != null ? String(search.preset) : undefined,
    userId: search.userId != null ? String(search.userId) : undefined,
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
      <GithubActivitySection data={data} />
      <AuditHighlightsSection data={data} />
      <FooterSection data={data} />
    </Stack>
  )
}

function UserReportContent({ data }: { data: UserReportPayload }) {
  const navigate = useNavigate()
  return (
    <Stack gap="xl">
      <UserCoverSection data={data} />
      <UserExecutiveSummary data={data} />
      <EffortCard effort={data.effort} className="page-section" />
      <BreakdownDonuts byStatus={data.byStatus} byPriority={data.byPriority} className="page-section" renderer="svg" />
      <TrendChart trend={data.taskTrend} className="page-section" renderer="svg" />
      <OverdueList tasks={data.overdueTasks} navigate={navigate} className="page-section" />
      <GithubActivitySection data={data} />
      <AuditHighlightsSection data={data} />
      <FooterSection data={data} />
    </Stack>
  )
}

function ReportPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [preset, setPreset] = useState<string>(search.preset ?? 'month')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(search.userId ?? ALL_USERS_VALUE)
  const [pdfState, setPdfState] = useState<{
    busy: boolean
    progress?: { done: number; total: number }
    error?: string
  }>({ busy: false })

  const { since, until } = useMemo(() => resolveRange(preset), [preset])

  const usersQ = useQuery({
    queryKey: ['admin', 'report', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        users: AdminUserOption[]
      }>,
  })
  const userOptions = useMemo(
    () => [
      { value: ALL_USERS_VALUE, label: 'Semua User' },
      ...(usersQ.data?.users ?? [])
        .filter((u) => !u.blocked)
        .map((u) => ({ value: u.id, label: u.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [usersQ.data],
  )

  const isUserMode = !!selectedUserId && selectedUserId !== ALL_USERS_VALUE

  const q = useQuery({
    queryKey: ['admin', 'report', preset],
    queryFn: () =>
      fetch(`/api/admin/report?since=${since.toISOString()}&until=${until.toISOString()}`, {
        credentials: 'include',
      }).then((r) => r.json()) as Promise<ReportPayload>,
    enabled: !isUserMode,
  })

  const userQ = useQuery({
    queryKey: ['admin', 'report', 'user', selectedUserId, preset],
    queryFn: () =>
      fetch(
        `/api/admin/report/user?userId=${selectedUserId}&since=${since.toISOString()}&until=${until.toISOString()}`,
        {
          credentials: 'include',
        },
      ).then((r) => r.json()) as Promise<UserReportPayload>,
    enabled: isUserMode,
  })

  const handlePrint = async () => {
    if (pdfState.busy) return
    const root = document.querySelector<HTMLElement>('.report-root')
    if (!root) return
    setPdfState({ busy: true, progress: { done: 0, total: 0 } })
    try {
      const { generateReportPdf } = await import('@/frontend/lib/report-pdf')
      const filename =
        isUserMode && userQ.data
          ? `user-report-${userQ.data.user.email.split('@')[0]}-${preset}-${toLocalDateStr(new Date())}.pdf`
          : `portfolio-report-${preset}-${toLocalDateStr(new Date())}.pdf`
      await generateReportPdf(root, filename, (done, total) => setPdfState({ busy: true, progress: { done, total } }))
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
              <ActionIcon variant="subtle" onClick={() => navigate({ to: '/admin', search: { tab: 'overview' } })}>
                <TbArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon variant="light" color="violet" size="md" radius="md">
                <TbFileReport size={18} />
              </ThemeIcon>
              <Text fw={600}>{isUserMode ? 'Laporan Per User' : 'Laporan Portfolio'}</Text>
            </Group>
            <Group gap="sm">
              <Select
                leftSection={<TbUser size={14} />}
                data={userOptions}
                value={selectedUserId}
                onChange={(v) => setSelectedUserId(v ?? ALL_USERS_VALUE)}
                searchable
                size="xs"
                w={220}
              />
              <SegmentedControl size="xs" value={preset} onChange={setPreset} data={PRESETS} />
              <Tooltip label="Refresh">
                <ActionIcon
                  variant="subtle"
                  onClick={() => (isUserMode ? userQ.refetch() : q.refetch())}
                  loading={isUserMode ? userQ.isFetching : q.isFetching}
                >
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
                  disabled={(isUserMode ? !userQ.data : !q.data) || pdfState.busy}
                >
                  Simpan PDF
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </div>

      <Container size="xl" py="lg">
        {isUserMode ? (
          userQ.isLoading ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : userQ.isError || !userQ.data ? (
            <Alert color="red" icon={<TbAlertTriangle size={16} />}>
              Gagal memuat laporan. Coba refresh.
            </Alert>
          ) : (
            <UserReportContent data={userQ.data} />
          )
        ) : q.isLoading ? (
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
