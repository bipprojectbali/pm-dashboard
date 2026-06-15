import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Container,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { TbChevronRight, TbCode } from 'react-icons/tb'
import { AiSettingsPanel } from '@/frontend/components/AiSettingsPanel'
import { AuditLogsPanel } from '@/frontend/components/admin/AuditLogsPanel'
import { UsersPanel } from '@/frontend/components/admin/UsersPanel'
import { ChannelSettingsPanel } from '@/frontend/components/ChannelSettingsPanel'
import { AppLogsPanel } from '@/frontend/components/dev/AppLogsPanel'
import { DatabasePanel } from '@/frontend/components/dev/DatabasePanel'
import { OverviewPanel } from '@/frontend/components/dev/OverviewPanel'
import { ProjectPanel } from '@/frontend/components/dev/ProjectPanel'
import { SyncPanel } from '@/frontend/components/dev/SyncPanel'
import { navGroups, TAB_META, type TabKey, validTabs } from '@/frontend/components/dev/dev-config'
import { ExtensionTogglePanel } from '@/frontend/components/ExtensionTogglePanel'
import { FileHealthPanel } from '@/frontend/components/FileHealthPanel'
import { NotificationBell } from '@/frontend/components/NotificationBell'
import { PermissionsPanel } from '@/frontend/components/PermissionsPanel'
import { SidebarAppSwitcher } from '@/frontend/components/SidebarAppSwitcher'
import { SidebarUserFooter } from '@/frontend/components/SidebarUserFooter'
import { SectionErrorBoundary } from '@/frontend/components/shared/SectionErrorBoundary'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/dev')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (validTabs.includes(search.tab as TabKey) ? search.tab : 'overview') as TabKey,
  }),
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (data.user.role !== 'SUPER_ADMIN') {
        if (data.user.role === 'ADMIN') throw redirect({ to: '/admin', search: { tab: 'overview' } })
        throw redirect({ to: '/pm', search: { tab: 'overview' } })
      }
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: DevPage,
})

function DevPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab: active } = Route.useSearch()
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const scrollPositions = useRef<Partial<Record<TabKey, number>>>({})
  const previousTab = useRef<TabKey>(active)
  const setActive = (key: TabKey) => {
    scrollPositions.current[previousTab.current] = window.scrollY
    navigate({ to: '/dev', search: { tab: key } })
    closeMobile()
  }
  useEffect(() => {
    if (previousTab.current === active) return
    previousTab.current = active
    const saved = scrollPositions.current[active] ?? 0
    window.scrollTo({ top: saved, behavior: 'auto' })
  }, [active])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dev:sidebar') === 'collapsed')
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('dev:sidebar', next ? 'collapsed' : 'open')
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

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: collapsed && !isMobile ? 60 : 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
      styles={{
        navbar: {
          backgroundColor: 'var(--app-navbar-bg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        header: { backgroundColor: 'var(--app-navbar-bg)' },
      }}
    >
      <AppShell.Header style={{ backgroundImage: 'linear-gradient(rgba(250,82,82,0.07), rgba(250,82,82,0.07))' }}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
              <TbCode size={18} />
            </ThemeIcon>
            <Title order={4}>Konsol Dev</Title>
          </Group>
          <Group gap="xs">
            <NotificationBell size="md" />
            <Badge color="red" variant="light" size="sm">
              {user?.role}
            </Badge>
            <Text size="sm" visibleFrom="sm" c="dimmed">
              {user?.email}
            </Text>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p={collapsed && !isMobile ? 'xs' : 'md'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'light-dark(rgba(250,82,82,0.05), rgba(250,82,82,0.08))',
        }}
      >
        <Stack
          gap={collapsed && !isMobile ? 'xs' : 'md'}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'none' }}
        >
          {navGroups.map((group) => (
            <Stack key={group.label} gap={4}>
              {!(collapsed && !isMobile) && (
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }} px="xs" pt={4}>
                  {group.label}
                </Text>
              )}
              {group.items.map((item) => {
                if (collapsed && !isMobile) {
                  return (
                    <Tooltip key={item.key} label={item.label} position="right" withArrow>
                      <ActionIcon
                        variant={active === item.key ? 'filled' : 'subtle'}
                        color={active === item.key ? 'red' : 'gray'}
                        size="lg"
                        onClick={() => setActive(item.key)}
                      >
                        <item.icon size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )
                }
                return (
                  <NavLink
                    key={item.key}
                    label={item.label}
                    leftSection={<item.icon size={18} />}
                    rightSection={<TbChevronRight size={14} />}
                    color="red"
                    active={active === item.key}
                    onClick={() => setActive(item.key)}
                  />
                )
              })}
            </Stack>
          ))}

          <SidebarAppSwitcher current="dev" role={user?.role} collapsed={collapsed && !isMobile} />
        </Stack>

        <SidebarUserFooter
          user={user}
          collapsed={collapsed && !isMobile}
          onToggleCollapse={toggleSidebar}
          onLogout={confirmLogout}
          isLoggingOut={logout.isPending}
        />
      </AppShell.Navbar>

      <AppShell.Main style={{ borderTop: '3px solid var(--mantine-color-red-5)' }}>
        <Container size={'xl'} px={0}>
          <Stack gap="md">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.6 }}>
                Dev · {TAB_META[active].label}
              </Text>
              <Text size="sm" c="dimmed">
                {TAB_META[active].description}
              </Text>
            </div>
            <SectionErrorBoundary key={active} label={active}>
              {active === 'overview' && <OverviewPanel />}
              {active === 'users' && <UsersPanel />}
              {active === 'app-logs' && <AppLogsPanel />}
              {active === 'user-logs' && <AuditLogsPanel />}
              {active === 'database' && <DatabasePanel />}
              {active === 'project' && <ProjectPanel />}
              {active === 'file-health' && <FileHealthPanel />}
              {active === 'sync' && <SyncPanel />}
              {active === 'channel' && <ChannelSettingsPanel />}
              {active === 'ai' && <AiSettingsPanel showDeleteHistory />}
              {active === 'ext-github' && <ExtensionTogglePanel only="github" />}
              {active === 'ext-chat' && <ExtensionTogglePanel only="chat" />}
              {active === 'permissions' && <PermissionsPanel />}
            </SectionErrorBoundary>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
