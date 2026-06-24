import { Box, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbArrowRight, TbPlugConnected } from 'react-icons/tb'
import { getDefaultRoute } from '@/frontend/hooks/useAuth'
import type { LandingUser } from './data'

interface Props {
  isDark: boolean
  user: LandingUser
}

export function CtaBanner({ isDark, user }: Props) {
  const dashboardHref = user ? getDefaultRoute(user.role) : '/login'

  return (
    <Container size="lg" py={{ base: 60, sm: 100 }}>
      <Box
        p={{ base: 'xl', sm: 48 }}
        style={{
          borderRadius: 24,
          background: isDark
            ? 'linear-gradient(135deg, rgba(79,124,255,0.12) 0%, rgba(155,89,245,0.12) 100%)'
            : 'linear-gradient(135deg, rgba(79,124,255,0.07) 0%, rgba(155,89,245,0.07) 100%)',
          border: '1px solid var(--app-border-strong)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,124,255,0.15) 0%, transparent 70%)',
            top: '-100px',
            right: '-50px',
            pointerEvents: 'none',
          }}
        />

        <Group justify="space-between" align="center" wrap="wrap" gap="xl" style={{ position: 'relative' }}>
          <Stack gap="md" maw={520}>
            <Group gap={8}>
              <TbPlugConnected size={18} color="var(--app-brand-from)" />
              <Text fw={700} size="xs" tt="uppercase" style={{ color: 'var(--app-brand-from)', letterSpacing: '0.08em' }}>
                Siap digunakan
              </Text>
            </Group>
            <Title
              order={3}
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.2 }}
            >
              Mulai tracking tim kamu dalam hitungan menit
            </Title>
            <Text c="dimmed" size="sm" lh={1.7}>
              Gunakan akun demo atau login dengan Google. SUPER_ADMIN membuka akses penuh ke Dev Console.
            </Text>
          </Stack>
          <Stack gap="sm">
            <Button
              component={Link}
              to={dashboardHref}
              size="md"
              rightSection={<TbArrowRight size={16} />}
              style={{
                background: 'var(--app-brand-gradient)',
                border: 'none',
                fontWeight: 700,
                height: 46,
                paddingInline: 24,
                letterSpacing: '-0.01em',
                boxShadow: '0 6px 20px rgba(79,124,255,0.3)',
              }}
            >
              {user ? 'Open dashboard' : 'Sign in sekarang'}
            </Button>
            {!user && (
              <Text size="xs" c="dimmed" ta="center">Gratis · Tidak perlu kartu kredit</Text>
            )}
          </Stack>
        </Group>
      </Box>
    </Container>
  )
}
