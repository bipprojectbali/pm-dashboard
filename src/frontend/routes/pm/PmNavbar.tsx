import { ActionIcon, AppShell, Badge, NavLink, Stack, Text, Tooltip } from '@mantine/core'
import { SidebarAppSwitcher } from '@/frontend/components/SidebarAppSwitcher'
import { SidebarUserFooter } from '@/frontend/components/SidebarUserFooter'
import { buildNavItems } from './navItems'
import type { TabKey } from './types'

type PmUser = {
  id?: string
  name?: string
  email?: string
  role?: string
  image?: string | null
} | null | undefined

export function PmNavbar({
  isCollapsed,
  active,
  counts,
  user,
  onSetActive,
  onToggleSidebar,
  onLogout,
  isLoggingOut,
}: {
  isCollapsed: boolean
  active: TabKey
  counts: { events: number; tasks: number; projects: number; overdue: number }
  user: PmUser
  onSetActive: (key: TabKey) => void
  onToggleSidebar: () => void
  onLogout: () => void
  isLoggingOut: boolean
}) {
  const navItems = buildNavItems(counts)
  return (
    <AppShell.Navbar
      p={isCollapsed ? 'xs' : 'md'}
      style={{ background: 'light-dark(rgba(34,139,230,0.05), rgba(34,139,230,0.08))' }}
    >
      <Stack gap="md" style={{ flex: 1, overflowY: 'auto' }}>
        <Stack gap={4}>
          {!isCollapsed && (
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }} px="xs" pt={4}>
              Manajer Proyek
            </Text>
          )}
          {navItems.map((item) => {
            const Icon = item.icon
            if (isCollapsed) {
              return (
                <Tooltip
                  key={item.key}
                  label={
                    <Stack gap={0}>
                      <Text size="xs" fw={600}>
                        {item.label}
                        {item.badge ? ` · ${item.badge}` : ''}
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
                    onClick={() => onSetActive(item.key)}
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
                rightSection={
                  item.badge ? (
                    <Badge size="xs" variant="light" color={item.badgeColor ?? 'blue'}>
                      {item.badge}
                    </Badge>
                  ) : null
                }
                color="blue"
                active={active === item.key}
                onClick={() => onSetActive(item.key)}
              />
            )
          })}
        </Stack>
        <SidebarAppSwitcher current="pm" role={user?.role} collapsed={isCollapsed} />
      </Stack>
      <SidebarUserFooter
        user={user}
        collapsed={isCollapsed}
        onToggleCollapse={onToggleSidebar}
        onLogout={onLogout}
        isLoggingOut={isLoggingOut}
      />
    </AppShell.Navbar>
  )
}
