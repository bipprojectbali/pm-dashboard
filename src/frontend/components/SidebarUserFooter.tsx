import { ActionIcon, Box, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { UserAvatar } from './shared/UserAvatar'
import { useNavigate } from '@tanstack/react-router'
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbLogout, TbSparkles } from 'react-icons/tb'
import { ThemeToggle } from './ThemeToggle'
import { WHATS_NEW_EVENT } from '../hooks/useWhatsNew'

const openWhatsNew = () => window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT))

type User = { name?: string; email?: string; role?: string; image?: string | null } | null | undefined

const roleConfig: Record<string, { color: string; bg: string; label: string }> = {
  USER:        { color: '#4f7cff', bg: 'rgba(79,124,255,0.12)',   label: 'User' },
  QC:          { color: '#20c997', bg: 'rgba(32,201,151,0.12)',   label: 'QC' },
  ADMIN:       { color: '#9b59f5', bg: 'rgba(155,89,245,0.12)',   label: 'Admin' },
  SUPER_ADMIN: { color: '#f03e3e', bg: 'rgba(240,62,62,0.12)',    label: 'Super Admin' },
}

export function SidebarUserFooter({
  user,
  collapsed,
  onToggleCollapse,
  onLogout,
  isLoggingOut,
  accentColor = 'blue',
}: {
  user: User
  collapsed: boolean
  onToggleCollapse: () => void
  onLogout: () => void
  isLoggingOut?: boolean
  accentColor?: string
}) {
  const navigate = useNavigate()
  const roleKey = user?.role ?? 'USER'
  const config = roleConfig[roleKey] ?? { color: '#4f7cff', bg: 'rgba(79,124,255,0.12)', label: 'User' }
  const goProfile = () => navigate({ to: '/settings', search: { section: 'profile' } })

  if (collapsed) {
    return (
      <Stack
        align="center"
        gap={6}
        py="sm"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <Tooltip
          label={
            <Stack gap={2}>
              <Text size="xs" fw={700}>{user?.name}</Text>
              <Text size="xs" c="dimmed">{user?.email}</Text>
              <Box
                px={6}
                py={2}
                mt={2}
                style={{
                  borderRadius: 4,
                  background: config.bg,
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                <Text size="xs" fw={700} style={{ color: config.color }}>{config.label}</Text>
              </Box>
            </Stack>
          }
          position="right"
          withArrow
        >
          <div onClick={goProfile} style={{ cursor: 'pointer', flexShrink: 0 }}>
            <UserAvatar
              name={user?.name}
              image={user?.image}
              size={34}
              color="blue"
              style={{ border: `2px solid ${config.color}` }}
            />
          </div>
        </Tooltip>
        <ThemeToggle size="sm" />
        <Tooltip label="Yang Baru" position="right" withArrow>
          <ActionIcon variant="subtle" color="violet" size={34} radius="md" onClick={openWhatsNew}>
            <TbSparkles size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Perluas sidebar" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={34}
            radius="md"
            onClick={onToggleCollapse}
            style={{ flexShrink: 0 }}
          >
            <TbLayoutSidebarLeftExpand size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Keluar" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size={34}
            radius="md"
            onClick={onLogout}
            loading={isLoggingOut}
            style={{ flexShrink: 0 }}
          >
            <TbLogout size={15} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    )
  }

  return (
    <Stack gap={6} pt="sm" style={{ borderTop: '1px solid var(--app-border)' }}>
      {/* User card */}
      <UnstyledButton
        onClick={goProfile}
        p="xs"
        style={{
          borderRadius: 10,
          transition: 'background 130ms ease',
          width: '100%',
        }}
        className="sidebar-user-card"
      >
        <Group gap="sm" wrap="nowrap">
          <UserAvatar
            name={user?.name}
            image={user?.image}
            size={36}
            color="blue"
            style={{
              border: `2px solid ${config.color}`,
              flexShrink: 0,
            }}
          />
          <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600} truncate style={{ letterSpacing: '-0.01em' }}>
              {user?.name ?? '—'}
            </Text>
            <Text size="xs" c="dimmed" truncate style={{ fontSize: '0.72rem' }}>
              {user?.email ?? ''}
            </Text>
          </Stack>
          <Box
            px={7}
            py={2}
            style={{
              borderRadius: 5,
              background: config.bg,
              flexShrink: 0,
            }}
          >
            <Text size="xs" fw={700} style={{ color: config.color, fontSize: '0.65rem', letterSpacing: '0.03em' }}>
              {config.label}
            </Text>
          </Box>
        </Group>
      </UnstyledButton>

      {/* Actions row */}
      <Group justify="space-between" gap="xs" px={2}>
        <Group gap={4}>
          <ThemeToggle size="sm" />
          <Tooltip label="Yang Baru" withArrow>
            <ActionIcon variant="subtle" color="violet" size={32} radius="md" onClick={openWhatsNew}>
              <TbSparkles size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Ciutkan sidebar" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={32}
              radius="md"
              onClick={onToggleCollapse}
              visibleFrom="sm"
            >
              <TbLayoutSidebarLeftCollapse size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Tooltip label="Keluar" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size={32}
            radius="md"
            onClick={onLogout}
            loading={isLoggingOut}
          >
            <TbLogout size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  )
}
