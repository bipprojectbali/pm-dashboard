import { ActionIcon, Box, Group, Stack, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import type { IconType } from 'react-icons'
import { TbBug, TbCode, TbSettings, TbShieldLock, TbTarget } from 'react-icons/tb'

type AppKey = 'pm' | 'qc' | 'admin' | 'dev' | 'settings'
type Role = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

type AppDef = {
  key: AppKey
  label: string
  description: string
  icon: IconType
  color: string
  roles: Role[]
  navigate: (nav: ReturnType<typeof useNavigate>) => void
}

const APPS: AppDef[] = [
  {
    key: 'pm',
    label: 'Manajer Proyek',
    description: 'Proyek & tugas',
    icon: TbTarget,
    color: 'blue',
    roles: ['USER', 'QC', 'ADMIN', 'SUPER_ADMIN'],
    navigate: (nav) => nav({ to: '/pm', search: { tab: 'overview' } }),
  },
  {
    key: 'qc',
    label: 'QC Tickets',
    description: 'Bug & tiket aplikasi',
    icon: TbBug,
    color: 'red',
    roles: ['QC', 'ADMIN', 'SUPER_ADMIN'],
    navigate: (nav) => nav({ to: '/qc', search: { status: 'open' } }),
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Cockpit & pengelolaan',
    icon: TbShieldLock,
    color: 'violet',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    navigate: (nav) => nav({ to: '/admin', search: { tab: 'overview' } }),
  },
  {
    key: 'dev',
    label: 'Dev Console',
    description: 'Tools & diagnostics',
    icon: TbCode,
    color: 'orange',
    roles: ['SUPER_ADMIN'],
    navigate: (nav) => nav({ to: '/dev', search: { tab: 'overview' } }),
  },
  {
    key: 'settings',
    label: 'Pengaturan',
    description: 'Profil & preferensi',
    icon: TbSettings,
    color: 'gray',
    roles: ['USER', 'QC', 'ADMIN', 'SUPER_ADMIN'],
    navigate: (nav) => nav({ to: '/settings', search: { section: 'profile' } }),
  },
]

export function SidebarAppSwitcher({
  current,
  role,
  collapsed,
}: {
  current: AppKey
  role?: string
  collapsed: boolean
}) {
  const navigate = useNavigate()
  const items = APPS.filter((a) => a.key !== current && a.roles.includes((role ?? 'USER') as Role))
  if (items.length === 0) return null

  if (collapsed) {
    return (
      <Stack gap={4} align="center">
        <Box
          style={{
            width: 28,
            height: 1,
            background: 'var(--app-border)',
            borderRadius: 1,
            marginBottom: 2,
          }}
        />
        {items.map((app) => {
          const Icon = app.icon
          return (
            <Tooltip key={app.key} label={app.label} position="right" withArrow>
              <ActionIcon
                variant="subtle"
                color={app.color}
                size={34}
                radius="md"
                onClick={() => app.navigate(navigate)}
                style={{ flexShrink: 0 }}
              >
                <Icon size={17} />
              </ActionIcon>
            </Tooltip>
          )
        })}
      </Stack>
    )
  }

  return (
    <Stack gap={2}>
      <Text
        size="xs"
        fw={700}
        c="dimmed"
        tt="uppercase"
        px="xs"
        pt={4}
        pb={2}
        style={{ letterSpacing: '0.08em', fontSize: '0.65rem' }}
      >
        Aplikasi Lain
      </Text>
      {items.map((app) => {
        const Icon = app.icon
        return (
          <UnstyledButton
            key={app.key}
            onClick={() => app.navigate(navigate)}
            px="xs"
            py={6}
            style={{
              borderRadius: 8,
              transition: 'background 130ms ease',
              width: '100%',
            }}
            className="sidebar-app-item"
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon
                variant="light"
                color={app.color}
                size={30}
                radius="md"
                style={{ flexShrink: 0 }}
              >
                <Icon size={15} />
              </ThemeIcon>
              <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={600} truncate style={{ fontSize: '0.8rem', letterSpacing: '-0.01em' }}>
                  {app.label}
                </Text>
                <Text size="xs" c="dimmed" truncate style={{ fontSize: '0.7rem' }}>
                  {app.description}
                </Text>
              </Stack>
            </Group>
          </UnstyledButton>
        )
      })}
    </Stack>
  )
}
