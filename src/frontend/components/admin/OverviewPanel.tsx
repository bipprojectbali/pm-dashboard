import { ActionIcon, Button, Group, Select, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { TbFileReport, TbHeartbeat, TbListCheck, TbRefresh, TbTarget, TbUser, TbUsersGroup } from 'react-icons/tb'
import { EmptyState } from '@/frontend/components/shared/EmptyState'
import { SectionSkeleton } from '@/frontend/components/shared/LoadingState'
import { type AnalyticsData, AnalyticsSection } from './AnalyticsSection'
import { KpiCard } from './overviewpanel/KpiCard'
import { PortfolioHealthSection } from './overviewpanel/PortfolioHealthSection'
import { RecentActivityCard } from './overviewpanel/RecentActivityCard'
import { RedFlagsSection } from './overviewpanel/RedFlagsSection'
import { TeamLoadSection } from './overviewpanel/TeamLoadSection'
import type {
  AdminUser,
  AuditLogEntry,
  HealthRow,
  LoadRow,
  ProjectRow,
  RiskReport,
  TaskRow,
  UpcomingEvent,
} from './overviewpanel/types'
import { UpcomingEventsCard } from './overviewpanel/UpcomingEventsCard'
import { useFreshness } from './overviewpanel/useFreshness'
import { UserReportPanel } from './UserReportPanel'

const ALL_USERS_VALUE = '__all__'

export function OverviewPanel() {
  const navigate = useNavigate()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(ALL_USERS_VALUE)

  const usersQ = useQuery({
    queryKey: ['admin', 'overview', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
    refetchInterval: 30_000,
  })
  const projectsQ = useQuery({
    queryKey: ['admin', 'overview', 'projects'],
    queryFn: () =>
      fetch('/api/projects', { credentials: 'include' }).then((r) => r.json()) as Promise<{ projects: ProjectRow[] }>,
    refetchInterval: 30_000,
  })
  const tasksQ = useQuery({
    queryKey: ['admin', 'overview', 'tasks'],
    queryFn: () =>
      fetch('/api/tasks?limit=500', { credentials: 'include' }).then((r) => r.json()) as Promise<{ tasks: TaskRow[] }>,
    refetchInterval: 30_000,
  })
  const auditQ = useQuery({
    queryKey: ['admin', 'overview', 'audit'],
    queryFn: () =>
      fetch('/api/admin/logs/audit?limit=8', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        logs: AuditLogEntry[]
      }>,
    refetchInterval: 30_000,
  })
  const risksQ = useQuery({
    queryKey: ['admin', 'overview', 'risks'],
    queryFn: () =>
      fetch('/api/admin/overview/risks', { credentials: 'include' }).then((r) => r.json()) as Promise<RiskReport>,
    refetchInterval: 30_000,
  })
  const healthQ = useQuery({
    queryKey: ['admin', 'overview', 'health'],
    queryFn: () =>
      fetch('/api/admin/overview/health?limit=12', { credentials: 'include' }).then((r) => r.json()) as Promise<{
        count: number
        projects: HealthRow[]
      }>,
    refetchInterval: 60_000,
  })
  const loadQ = useQuery({
    queryKey: ['admin', 'overview', 'load'],
    queryFn: () =>
      fetch('/api/admin/overview/load?includeUnassigned=false&limit=12', { credentials: 'include' }).then((r) =>
        r.json(),
      ) as Promise<{ count: number; rows: LoadRow[] }>,
    refetchInterval: 60_000,
  })
  const analyticsQ = useQuery({
    queryKey: ['admin', 'overview', 'analytics'],
    queryFn: () =>
      fetch('/api/admin/overview/analytics', { credentials: 'include' }).then((r) =>
        r.json(),
      ) as Promise<AnalyticsData>,
    refetchInterval: 60_000,
  })
  const eventsQ = useQuery<{ events: UpcomingEvent[] }>({
    queryKey: ['events', 'badge'],
    queryFn: () => fetch('/api/events?upcoming=true&limit=100', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })
  // Accurate today/week counts for UpcomingEventsCard's badges — not derived
  // from eventsQ's capped list.
  const eventBadgeStatsQ = useQuery<{ todayCount: number; next7dCount: number }>({
    queryKey: ['events', 'badge-stats'],
    queryFn: () => fetch('/api/events/badge-stats', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })

  const loading = usersQ.isLoading || projectsQ.isLoading || tasksQ.isLoading || auditQ.isLoading
  const fetching =
    usersQ.isFetching ||
    projectsQ.isFetching ||
    tasksQ.isFetching ||
    auditQ.isFetching ||
    risksQ.isFetching ||
    healthQ.isFetching ||
    loadQ.isFetching ||
    analyticsQ.isFetching ||
    eventsQ.isFetching

  const stats = useMemo(() => {
    const users = usersQ.data?.users ?? []
    const projects = projectsQ.data?.projects ?? []
    const tasks = tasksQ.data?.tasks ?? []
    const now = Date.now()
    const blocked = users.filter((u) => u.blocked).length
    const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length
    const openTasks = tasks.filter((t) => t.status !== 'CLOSED').length
    const overdueTasks = tasks.filter(
      (t) => t.status !== 'CLOSED' && t.dueAt && new Date(t.dueAt).getTime() < now,
    ).length
    return {
      totalUsers: users.length,
      blocked,
      activeProjects,
      totalProjects: projects.length,
      openTasks,
      overdueTasks,
    }
  }, [usersQ.data, projectsQ.data, tasksQ.data])

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

  const refetchAll = () => {
    usersQ.refetch()
    projectsQ.refetch()
    tasksQ.refetch()
    auditQ.refetch()
    risksQ.refetch()
    healthQ.refetch()
    loadQ.refetch()
    analyticsQ.refetch()
    eventsQ.refetch()
  }

  const lastFetchedAt = useMemo(() => {
    const updates = [
      usersQ.dataUpdatedAt,
      projectsQ.dataUpdatedAt,
      tasksQ.dataUpdatedAt,
      auditQ.dataUpdatedAt,
      risksQ.dataUpdatedAt,
      healthQ.dataUpdatedAt,
      loadQ.dataUpdatedAt,
      analyticsQ.dataUpdatedAt,
      eventsQ.dataUpdatedAt,
    ].filter((t) => t > 0)
    return updates.length ? Math.min(...updates) : 0
  }, [
    usersQ.dataUpdatedAt,
    projectsQ.dataUpdatedAt,
    tasksQ.dataUpdatedAt,
    auditQ.dataUpdatedAt,
    risksQ.dataUpdatedAt,
    healthQ.dataUpdatedAt,
    loadQ.dataUpdatedAt,
    analyticsQ.dataUpdatedAt,
    eventsQ.dataUpdatedAt,
  ])

  const freshness = useFreshness(lastFetchedAt)

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Ringkasan Admin</Title>
          <Text c="dimmed" size="sm">
            Ringkasan sistem real-time. Auto-refresh 30 detik.
          </Text>
        </div>
        <Group gap="xs">
          {freshness && (
            <Text size="xs" c="dimmed">
              updated {freshness}
            </Text>
          )}
          <Select
            leftSection={<TbUser size={14} />}
            data={userOptions}
            value={selectedUserId}
            onChange={(v) => setSelectedUserId(v ?? ALL_USERS_VALUE)}
            searchable
            size="xs"
            w={240}
          />
          <Button
            leftSection={<TbFileReport size={16} />}
            size="xs"
            variant="light"
            color="violet"
            onClick={() => {
              const hasUser = selectedUserId && selectedUserId !== ALL_USERS_VALUE
              window.location.href = hasUser ? `/admin/report?userId=${selectedUserId}` : '/admin/report'
            }}
          >
            Laporan Lengkap
          </Button>
          <Tooltip label="Refresh all">
            <ActionIcon variant="subtle" onClick={refetchAll} loading={fetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {selectedUserId && selectedUserId !== ALL_USERS_VALUE ? (
        <UserReportPanel userId={selectedUserId} onClear={() => setSelectedUserId(ALL_USERS_VALUE)} />
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <KpiCard
              label="Total Pengguna"
              value={stats.totalUsers}
              sub={stats.blocked > 0 ? `${stats.blocked} diblokir` : 'tidak ada yang diblokir'}
              subColor={stats.blocked > 0 ? 'red' : undefined}
              icon={TbUsersGroup}
              color="violet"
              onClick={() => navigate({ to: '/admin', search: { tab: 'users' } })}
              loading={loading}
              info="Jumlah seluruh akun terdaftar (semua role). Sub-label menampilkan berapa user yang saat ini diblokir. Klik untuk membuka tab Pengguna."
            />
            <KpiCard
              label="Proyek Aktif"
              value={stats.activeProjects}
              sub={`dari ${stats.totalProjects} total`}
              icon={TbTarget}
              color="blue"
              onClick={() => navigate({ to: '/admin', search: { tab: 'projects' } })}
              loading={loading}
              info="Project berstatus ACTIVE dari total semua project (termasuk DRAFT, ON_HOLD, COMPLETED, CANCELLED). Klik untuk membuka tab Proyek."
            />
            <KpiCard
              label="Task Terbuka"
              value={stats.openTasks}
              sub={stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : 'tidak ada yang overdue'}
              subColor={stats.overdueTasks > 0 ? 'red' : undefined}
              icon={TbListCheck}
              color="red"
              onClick={() => navigate({ to: '/admin', search: { tab: 'tasks' } })}
              loading={loading}
              info="Task yang belum CLOSED (OPEN / IN_PROGRESS / READY_FOR_QC / REOPENED). Sub-label menghitung yang sudah lewat dueAt. Klik untuk membuka tab Triase Task."
            />
          </SimpleGrid>

          <UpcomingEventsCard
            events={eventsQ.data?.events ?? []}
            isLoading={eventsQ.isLoading}
            navigate={navigate}
            todayCount={eventBadgeStatsQ.data?.todayCount}
            weekCount={
              eventBadgeStatsQ.data
                ? Math.max(0, eventBadgeStatsQ.data.next7dCount - eventBadgeStatsQ.data.todayCount)
                : undefined
            }
          />

          {risksQ.isLoading ? (
            <SectionSkeleton height={220} />
          ) : (
            risksQ.data && <RedFlagsSection risks={risksQ.data} navigate={navigate} />
          )}

          {healthQ.isLoading ? (
            <SectionSkeleton height={180} />
          ) : healthQ.data && healthQ.data.projects.length > 0 ? (
            <PortfolioHealthSection rows={healthQ.data.projects} navigate={navigate} />
          ) : healthQ.data ? (
            <EmptyState
              icon={TbHeartbeat}
              color="blue"
              title="Kesehatan Portfolio"
              message="Belum ada project aktif. Buat project untuk melihat skor kesehatan A–F."
              ctaLabel="Buka Projects"
              onCta={() => navigate({ to: '/admin', search: { tab: 'projects' } })}
            />
          ) : null}

          {loadQ.isLoading ? (
            <SectionSkeleton height={160} />
          ) : loadQ.data && loadQ.data.rows.length > 0 ? (
            <TeamLoadSection rows={loadQ.data.rows} onSelectUser={setSelectedUserId} />
          ) : loadQ.data ? (
            <EmptyState
              icon={TbUsersGroup}
              color="violet"
              title="Beban Tim"
              message="Belum ada task aktif yang di-assign. Team load akan muncul saat user punya beban kerja."
            />
          ) : null}

          {analyticsQ.isLoading ? (
            <SectionSkeleton height={320} />
          ) : analyticsQ.data ? (
            <AnalyticsSection data={analyticsQ.data} />
          ) : null}

          <RecentActivityCard logs={auditQ.data?.logs ?? []} isLoading={auditQ.isLoading} />
        </>
      )}
    </Stack>
  )
}
