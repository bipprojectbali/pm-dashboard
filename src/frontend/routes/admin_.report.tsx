import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { TbAlertTriangle, TbArrowLeft, TbFileReport, TbPrinter, TbRefresh } from 'react-icons/tb'
import { toLocalDateStr } from '@/frontend/lib/dates'
import { GithubActivitySection, AuditHighlightsSection, FooterSection } from './admin_report/ActivitySections'
import { DistributionSection, TimelineSection, VelocityTrendSection } from './admin_report/ChartSections'
import { CoverSection, ExecutiveSummary } from './admin_report/CoverExecutive'
import { PRESETS, resolveRange } from './admin_report/constants'
import { HealthGridSection, RiskRadarSection } from './admin_report/ProjectSections'
import { PdfOverlay } from './admin_report/shared'
import { TeamLoadSection } from './admin_report/TeamEffortSections'
import type { ReportPayload, ReportSearch } from './admin_report/types'

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

function ReportPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [preset, setPreset] = useState<string>(search.preset ?? 'month')
  const [pdfState, setPdfState] = useState<{
    busy: boolean
    progress?: { done: number; total: number }
    error?: string
  }>({ busy: false })

  const { since, until } = useMemo(() => resolveRange(preset), [preset])

  const q = useQuery({
    queryKey: ['admin', 'report', preset],
    queryFn: () =>
      fetch(`/api/admin/report?since=${since.toISOString()}&until=${until.toISOString()}`, {
        credentials: 'include',
      }).then((r) => r.json()) as Promise<ReportPayload>,
  })

  const handlePrint = async () => {
    if (pdfState.busy) return
    const root = document.querySelector<HTMLElement>('.report-root')
    if (!root) return
    setPdfState({ busy: true, progress: { done: 0, total: 0 } })
    try {
      const { generateReportPdf } = await import('@/frontend/lib/report-pdf')
      const filename = `portfolio-report-${preset}-${toLocalDateStr(new Date())}.pdf`
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
