import { Box, Button, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { FcGoogle } from 'react-icons/fc'
import { TbArrowRight, TbSparkles } from 'react-icons/tb'
import { getDefaultRoute } from '@/frontend/hooks/useAuth'
import { authClient } from '@/frontend/lib/authClient'
import type { LandingUser } from './data'
import { stats } from './data'

interface Props {
  isDark: boolean
  user: LandingUser
}

export function HeroSection({ isDark, user }: Props) {
  const dashboardHref = user ? getDefaultRoute(user.role) : '/login'

  return (
    <Box
      style={{
        background: isDark
          ? 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79,124,255,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 40%, rgba(155,89,245,0.12) 0%, transparent 60%)'
          : 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79,124,255,0.1) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 40%, rgba(155,89,245,0.08) 0%, transparent 60%)',
        borderBottom: '1px solid var(--app-border)',
      }}
    >
      <Container size="lg" py={{ base: 64, sm: 96, md: 120 }}>
        <Stack align="center" gap={0}>
          <Box
            mb="xl" px={14} py={6}
            style={{
              borderRadius: 999,
              border: '1px solid var(--app-border-strong)',
              background: isDark ? 'rgba(79,124,255,0.08)' : 'rgba(79,124,255,0.06)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <TbSparkles size={13} color="var(--app-brand-from)" />
            <Text size="xs" fw={600} style={{ color: 'var(--app-brand-from)', letterSpacing: '0.04em' }}>
              v0.4.0 · Full-stack, siap pakai
            </Text>
          </Box>

          <Title
            order={1} ta="center" mb="xl"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', lineHeight: 1.08, fontWeight: 900, letterSpacing: '-0.04em', maxWidth: 820 }}
          >
            Dashboard modern untuk{' '}
            <Text span inherit style={{ background: 'var(--app-brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              tim yang bergerak cepat
            </Text>
          </Title>

          <Text c="dimmed" ta="center" size="lg" maw={600} mb={40} lh={1.7} style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)' }}>
            Rencanakan project, lacak task real-time, ingest aktivitas dari setiap mesin, dan audit setiap webhook —
            dalam satu stack Bun + React.
          </Text>

          <Group gap="sm" mb={64} wrap="wrap" justify="center">
            {user ? (
              <Button
                component={Link}
                to={dashboardHref}
                size="lg"
                rightSection={<TbArrowRight size={18} />}
                style={{
                  background: 'var(--app-brand-gradient)',
                  border: 'none',
                  fontWeight: 700,
                  height: 52,
                  paddingInline: 28,
                  letterSpacing: '-0.01em',
                  boxShadow: '0 8px 24px rgba(79,124,255,0.35)',
                }}
              >
                Buka sebagai {user.name.split(' ')[0]}
              </Button>
            ) : (
              <>
                <Button
                  component={Link}
                  to="/login"
                  size="lg"
                  rightSection={<TbArrowRight size={18} />}
                  style={{
                    background: 'var(--app-brand-gradient)',
                    border: 'none',
                    fontWeight: 700,
                    height: 52,
                    paddingInline: 28,
                    letterSpacing: '-0.01em',
                    boxShadow: '0 8px 24px rgba(79,124,255,0.35)',
                  }}
                >
                  Mulai sekarang
                </Button>
                <Button
                  size="lg"
                  variant="default"
                  leftSection={<FcGoogle size={18} />}
                  onClick={() =>
                    authClient.signIn.social({ provider: 'google', callbackURL: '/admin', errorCallbackURL: '/login?error=google_failed' })
                  }
                  style={{
                    height: 52,
                    paddingInline: 24,
                    fontWeight: 600,
                    border: '1px solid var(--app-border-strong)',
                    backgroundColor: 'var(--app-surface)',
                  }}
                >
                  Continue with Google
                </Button>
              </>
            )}
          </Group>

          <Box
            style={{
              width: '100%',
              maxWidth: 720,
              borderRadius: 16,
              border: '1px solid var(--app-border)',
              backgroundColor: isDark ? 'rgba(22,24,30,0.8)' : 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(8px)',
              overflow: 'hidden',
            }}
          >
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing={0}>
              {stats.map((s, i) => {
                const Icon = s.icon
                const isLast = i === stats.length - 1
                const isOdd = i % 2 !== 0
                return (
                  <Box
                    key={s.label}
                    p="lg"
                    style={{
                      textAlign: 'center',
                      borderRight: !isLast && !isOdd ? '1px solid var(--app-border)' : undefined,
                      borderBottom: i < 2 ? '1px solid var(--app-border)' : undefined,
                    }}
                  >
                    <Icon size={18} color="var(--app-brand-from)" style={{ marginBottom: 8, opacity: 0.8 }} />
                    <Text fw={900} size="xl" style={{ letterSpacing: '-0.04em', background: 'var(--app-brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1, marginBottom: 4 }}>
                      {s.value}
                    </Text>
                    <Text c="dimmed" size="xs" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>{s.label}</Text>
                  </Box>
                )
              })}
            </SimpleGrid>
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}
