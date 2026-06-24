import { Anchor, Box, Button, Container, Group, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbArrowRight, TbBrandGithub, TbDashboard, TbLogin } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute } from '@/frontend/hooks/useAuth'
import type { LandingUser } from './data'

interface Props {
  isDark: boolean
  user: LandingUser
}

export function LandingNavbar({ isDark, user }: Props) {
  return (
    <Box
      style={{
        borderBottom: '1px solid var(--app-border)',
        backgroundColor: isDark ? 'rgba(13,14,18,0.85)' : 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Container size="lg" py="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Box
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'var(--app-brand-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(79,124,255,0.3)',
                flexShrink: 0,
              }}
            >
              <TbDashboard size={17} color="#fff" />
            </Box>
            <Text fw={800} size="md" style={{ letterSpacing: '-0.03em' }}>PM Dashboard</Text>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Anchor
              href="https://github.com/bipproduction"
              target="_blank"
              rel="noopener noreferrer"
              c="dimmed"
              underline="never"
              visibleFrom="sm"
            >
              <Group gap={6} wrap="nowrap">
                <TbBrandGithub size={17} />
                <Text size="sm" fw={500}>GitHub</Text>
              </Group>
            </Anchor>
            <ThemeToggle />
            {user ? (
              <Button
                component={Link}
                to={getDefaultRoute(user.role)}
                size="sm"
                rightSection={<TbArrowRight size={14} />}
                style={{ background: 'var(--app-brand-gradient)', border: 'none', fontWeight: 700 }}
              >
                Dashboard
              </Button>
            ) : (
              <Button
                component={Link}
                to="/login"
                size="sm"
                leftSection={<TbLogin size={14} />}
                variant="default"
                style={{ fontWeight: 600, border: '1px solid var(--app-border-strong)' }}
              >
                Login
              </Button>
            )}
          </Group>
        </Group>
      </Container>
    </Box>
  )
}
