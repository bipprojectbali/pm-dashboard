import { AppShell, Badge, Box, Burger, Container, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { TbTarget } from 'react-icons/tb'
import { EventDetailView } from '@/frontend/components/EventDetailView'
import { EventFormView } from '@/frontend/components/EventFormView'
import { EventsPanel } from '@/frontend/components/EventsPanel'
import { NotificationBell } from '@/frontend/components/NotificationBell'
import { PROJECT_DETAIL_TABS, type ProjectDetailTab, ProjectDetailView } from '@/frontend/components/ProjectDetailView'
import { ProjectsPanel } from '@/frontend/components/ProjectsPanel'
import { KindBoardPanel } from '@/frontend/components/pm/KindBoardPanel'
import { TaskDetailView } from '@/frontend/components/TaskDetailView'
import { TasksPanel } from '@/frontend/components/TasksPanel'
import { TeamPanel } from '@/frontend/components/TeamPanel'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { OverviewPanel } from './pm/OverviewPanel'
import { PmNavbar } from './pm/PmNavbar'
import { PmPageHeader } from './pm/PmPageHeader'
import { type PmSearch, type TabKey, validTabs } from './pm/types'
import type { UserPreferences } from './settings/types'

export const Route = createFileRoute('/pm')({
  validateSearch: (search: Record<string, unknown>): PmSearch => {
    // Leave tab undefined when absent/invalid so PmPage can fall back to the
    // user's pmDefaultTab preference (not a hardcoded 'overview').
    const tab = validTabs.includes(search.tab as TabKey) ? (search.tab as TabKey) : undefined
    const projectId = typeof search.projectId === 'string' ? search.projectId : undefined
    const detailTab = PROJECT_DETAIL_TABS.includes(search.detailTab as ProjectDetailTab)
      ? (search.detailTab as ProjectDetailTab)
      : undefined
    const taskId = typeof search.taskId === 'string' ? search.taskId : undefined
    const eventId = typeof search.eventId === 'string' ? search.eventId : undefined
    const eventMode = search.eventMode === 'create' || search.eventMode === 'edit' ? search.eventMode : undefined
    const out: PmSearch = {}
    if (tab) out.tab = tab
    if (projectId) out.projectId = projectId
    if (detailTab) out.detailTab = detailTab
    if (taskId) out.taskId = taskId
    if (eventId) out.eventId = eventId
    if (eventMode) out.eventMode = eventMode
    return out
  },
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      // Warm the preferences cache so PmPage can resolve the default tab
      // synchronously on first paint (no flicker from overview → preferred tab).
      await context.queryClient
        .ensureQueryData({
          queryKey: ['me', 'preferences'],
          queryFn: () => fetch('/api/me/preferences', { credentials: 'include' }).then((r) => r.json()),
        })
        .catch(() => {})
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: PmPage,
})

function PmPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const {
    tab: tabParam,
    projectId: activeProjectId,
    detailTab,
    taskId: activeTaskId,
    eventId: activeEventId,
    eventMode,
  } = Route.useSearch()
  // Preferences warmed in beforeLoad → available synchronously here.
  const { data: prefsData } = useQuery<{ preferences: UserPreferences }>({
    queryKey: ['me', 'preferences'],
    queryFn: () => fetch('/api/me/preferences', { credentials: 'include' }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  })
  const prefs = prefsData?.preferences
  // No explicit ?tab= → honour the user's default tab preference (guarded to a
  // tab this route actually renders; backend allows 'activity' which we don't).
  const preferredTab: TabKey = validTabs.includes(prefs?.pmDefaultTab as TabKey)
    ? (prefs?.pmDefaultTab as TabKey)
    : 'overview'
  const active: TabKey = tabParam ?? preferredTab
  // Map tasksDefaultFilter preference → initial state for the /pm Tugas board.
  const tasksInitialAssignee = prefs?.tasksDefaultFilter === 'mine' ? 'me' : null
  const tasksInitialSort =
    prefs?.tasksDefaultFilter === 'priority' ? ({ by: 'priority', dir: 'desc' } as const) : undefined
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const scrollPositions = useRef<Partial<Record<TabKey, number>>>({})
  const previousTab = useRef<TabKey>(active)

  const setActive = (key: TabKey) => {
    scrollPositions.current[previousTab.current] = window.scrollY
    navigate({ to: '/pm', search: { tab: key } })
    closeMobile()
  }
  useEffect(() => {
    if (previousTab.current === active) return
    previousTab.current = active
    const saved = scrollPositions.current[active] ?? 0
    window.scrollTo({ top: saved, behavior: 'auto' })
  }, [active])

  const setTasksProjectFilter = (projectId: string | null) => {
    navigate({ to: '/pm', search: { tab: 'tasks', ...(projectId ? { projectId } : {}) } })
  }
  const setProjectDetailTab = (next: ProjectDetailTab) => {
    if (!activeProjectId) return
    localStorage.setItem('pm:project:last-tab', next)
    navigate({ to: '/pm', search: { tab: 'projects', projectId: activeProjectId, detailTab: next } })
  }
  const closeProjectDetail = () => navigate({ to: '/pm', search: { tab: 'projects' } })
  const closeTaskDetail = () =>
    navigate({ to: '/pm', search: activeProjectId ? { tab: 'tasks', projectId: activeProjectId } : { tab: 'tasks' } })
  const openEvent = (id: string) => navigate({ to: '/pm', search: { tab: 'events', eventId: id } })
  const closeEventDetail = () => navigate({ to: '/pm', search: { tab: 'events' } })
  const openEventCreate = () => navigate({ to: '/pm', search: { tab: 'events', eventMode: 'create' } })
  const openEventEdit = (id: string) =>
    navigate({ to: '/pm', search: { tab: 'events', eventId: id, eventMode: 'edit' } })

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pm:sidebar') === 'collapsed')
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('pm:sidebar', next ? 'collapsed' : 'open')
      return next
    })
  }
  const confirmLogout = () =>
    modals.openConfirmModal({
      title: 'Keluar',
      children: <Text size="sm">Yakin ingin keluar dari sesi ini?</Text>,
      labels: { confirm: 'Keluar', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  // Badge queries — same cache keys as OverviewPanel so no extra network requests
  const eventsQ = useQuery<{ events: Array<{ startsAt: string }> }>({
    queryKey: ['events', 'badge'],
    queryFn: () => fetch('/api/events?upcoming=true&limit=100', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 5 * 60_000,
  })
  const projectsBadgeQ = useQuery<{ projects: Array<{ archivedAt: string | null }> }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects', { credentials: 'include' }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  })
  const tasksBadgeQ = useQuery<{ tasks: Array<{ status: string; dueAt: string | null }> }>({
    queryKey: ['tasks', 'mine=1', 'overview'],
    queryFn: () => fetch('/api/tasks?mine=1&limit=300', { credentials: 'include' }).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const eventBadgeCount = (eventsQ.data?.events ?? []).filter((e) => {
    const d = e.startsAt.slice(0, 10)
    return d === todayStr || d === tomorrowStr
  }).length
  const activeProjectsBadge = (projectsBadgeQ.data?.projects ?? []).filter((p) => !p.archivedAt).length
  const myActiveTasks = (tasksBadgeQ.data?.tasks ?? []).filter((t) => t.status !== 'CLOSED')
  const tasksBadge = myActiveTasks.length
  const overdueBadge = myActiveTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= Date.now()).length

  const isCollapsed = !!collapsed && !isMobile
  const desktopWidth = isCollapsed ? 60 : 260

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: desktopWidth, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
      styles={{
        navbar: { backgroundColor: 'var(--app-navbar-bg)' },
        header: { backgroundColor: 'var(--app-navbar-bg)' },
      }}
    >
      <AppShell.Header style={{ backgroundImage: 'linear-gradient(rgba(34,139,230,0.07), rgba(34,139,230,0.07))' }}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="light" color="blue" size="md">
              <TbTarget size={18} />
            </ThemeIcon>
            <Title order={4}>Manajer Proyek</Title>
          </Group>
          <Group gap="xs">
            <NotificationBell size="md" />
            <Badge color="blue" variant="light" size="sm">
              {user?.role}
            </Badge>
            <Text size="sm" visibleFrom="sm" c="dimmed">
              {user?.email}
            </Text>
          </Group>
        </Group>
      </AppShell.Header>

      <PmNavbar
        isCollapsed={isCollapsed}
        active={active}
        counts={{ events: eventBadgeCount, tasks: tasksBadge, projects: activeProjectsBadge, overdue: overdueBadge }}
        user={user}
        onSetActive={setActive}
        onToggleSidebar={toggleSidebar}
        onLogout={confirmLogout}
        isLoggingOut={logout.isPending}
      />

      <AppShell.Main style={{ borderTop: '3px solid var(--mantine-color-blue-5)' }}>
        <Container size="xl" px={0}>
          <Stack gap="md">
            {!activeProjectId && !activeTaskId && !activeEventId && !eventMode && <PmPageHeader tabKey={active} />}
            <Box key={active}>
              {active === 'overview' && (
                <OverviewPanel
                  userName={user?.name ?? ''}
                  onGoToTasks={() => setActive('tasks')}
                  onGoToProjects={() => setActive('projects')}
                />
              )}
              {active === 'projects' &&
                (activeProjectId ? (
                  <ProjectDetailView
                    projectId={activeProjectId}
                    tab={
                      detailTab ??
                      (localStorage.getItem('pm:project:last-tab') as ProjectDetailTab | null) ??
                      'overview'
                    }
                    onTabChange={setProjectDetailTab}
                    onBack={closeProjectDetail}
                    onDeleted={closeProjectDetail}
                  />
                ) : (
                  <ProjectsPanel />
                ))}
              {active === 'tasks' &&
                (activeTaskId ? (
                  <TaskDetailView taskId={activeTaskId} onBack={closeTaskDetail} />
                ) : (
                  <TasksPanel
                    projectId={activeProjectId}
                    onProjectChange={setTasksProjectFilter}
                    onBackToProjects={() => setActive('projects')}
                    initialAssigneeFilter={tasksInitialAssignee}
                    initialSort={tasksInitialSort}
                  />
                ))}
              {active === 'tickets' && (
                <KindBoardPanel
                  kind="TICKET"
                  title="Tiket"
                  description="Papan tiket masuk dari semua proyek. Triage saat meeting: tentukan prioritas, assign, dan pantau yang overdue."
                  createLabel="Buat Tiket"
                />
              )}
              {active === 'ideas' && (
                <KindBoardPanel
                  kind="IDEA"
                  title="Pengembangan"
                  description="Catatan ide & usulan pengembangan lintas proyek. Tinjau berkala, lalu naik-kelaskan jadi Task bila diputuskan dikerjakan."
                  createLabel="Catat Ide"
                />
              )}
              {active === 'team' && <TeamPanel />}
              {active === 'events' &&
                (eventMode === 'create' ? (
                  <EventFormView onBack={closeEventDetail} onSaved={(id) => openEvent(id)} />
                ) : eventMode === 'edit' && activeEventId ? (
                  <EventFormView
                    editId={activeEventId}
                    onBack={() => openEvent(activeEventId)}
                    onSaved={(id) => openEvent(id)}
                  />
                ) : activeEventId ? (
                  <EventDetailView
                    eventId={activeEventId}
                    onBack={closeEventDetail}
                    onEdit={() => openEventEdit(activeEventId)}
                  />
                ) : (
                  <EventsPanel onOpen={openEvent} onEdit={openEventEdit} onCreate={openEventCreate} />
                ))}
            </Box>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
