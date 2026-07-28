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
import { type ComponentType, useState } from 'react'
import { TbBell, TbSettings, TbShieldLock, TbUser } from 'react-icons/tb'
import { NotificationBell } from '@/frontend/components/NotificationBell'
import { SidebarAppSwitcher } from '@/frontend/components/SidebarAppSwitcher'
import { SidebarUserFooter } from '@/frontend/components/SidebarUserFooter'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { PreferencesSection } from './settings/PreferencesSection'
import { ProfileSection } from './settings/ProfileSection'
import { SecuritySection } from './settings/SecuritySection'
import { roleBadgeColor } from './settings/types'

const validSections = ['profile', 'security', 'preferences'] as const
type SectionKey = (typeof validSections)[number]
type SettingsSearch = { section?: SectionKey }

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const section = validSections.includes(search.section as SectionKey) ? (search.section as SectionKey) : undefined
    return section ? { section } : {}
  },
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: SettingsPage,
})

const navItems: { key: SectionKey; label: string; description: string; icon: ComponentType<{ size?: number }> }[] = [
  { key: 'profile', label: 'Profil', description: 'Info pribadi & stats kerja', icon: TbUser },
  { key: 'security', label: 'Keamanan', description: 'Password, sesi, riwayat', icon: TbShieldLock },
  { key: 'preferences', label: 'Preferensi', description: 'Notifikasi & tampilan', icon: TbBell },
]

function SettingsPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { section: activeSearch } = Route.useSearch()
  const active: SectionKey = activeSearch ?? 'profile'
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('settings:sidebar') === 'collapsed')

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('settings:sidebar', next ? 'collapsed' : 'open')
      return next
    })
  }
  const setActive = (key: SectionKey) => {
    navigate({ to: '/settings', search: { section: key } })
    closeMobile()
  }
  const confirmLogout = () =>
    modals.openConfirmModal({
      title: 'Keluar',
      children: <Text size="sm">Yakin ingin keluar dari sesi ini?</Text>,
      labels: { confirm: 'Keluar', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  const desktopWidth = collapsed ? 60 : 260

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
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="light" color="blue" size="md">
              <TbSettings size={18} />
            </ThemeIcon>
            <Title order={4}>Pengaturan</Title>
          </Group>
          <Group gap="xs">
            <NotificationBell size="md" />
            <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="sm">
              {user?.role}
            </Badge>
            <Text size="sm" visibleFrom="sm" c="dimmed">
              {user?.email}
            </Text>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={collapsed && !isMobile ? 'xs' : 'md'}>
        <Stack gap="md" style={{ flex: 1, overflowY: 'auto' }}>
          <Stack gap={4}>
            {!(collapsed && !isMobile) && (
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }} px="xs" pt={4}>
                Pengaturan Akun
              </Text>
            )}
            {navItems.map((item) => {
              const Icon = item.icon
              if (collapsed && !isMobile) {
                return (
                  <Tooltip
                    key={item.key}
                    label={
                      <Stack gap={0}>
                        <Text size="xs" fw={600}>
                          {item.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {item.description}
                        </Text>
                      </Stack>
                    }
                    position="right"
                    withArrow
                  >
                    <ActionIcon
                      variant={active === item.key ? 'filled' : 'subtle'}
                      color={active === item.key ? 'blue' : 'gray'}
                      size="lg"
                      onClick={() => setActive(item.key)}
                    >
                      <Icon size={18} />
                    </ActionIcon>
                  </Tooltip>
                )
              }
              return (
                <NavLink
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  leftSection={<Icon size={18} />}
                  color="blue"
                  active={active === item.key}
                  onClick={() => setActive(item.key)}
                />
              )
            })}
          </Stack>
          <SidebarAppSwitcher current="settings" role={user?.role} collapsed={collapsed && !isMobile} />
        </Stack>
        <SidebarUserFooter
          user={user}
          collapsed={collapsed && !isMobile}
          onToggleCollapse={toggleSidebar}
          onLogout={confirmLogout}
          isLoggingOut={logout.isPending}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" px={0}>
          {active === 'profile' && <ProfileSection user={user} />}
          {active === 'security' && <SecuritySection hasPassword={user?.hasPassword ?? true} />}
          {active === 'preferences' && <PreferencesSection />}
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
