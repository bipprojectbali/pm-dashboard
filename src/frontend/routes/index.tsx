import {
  Anchor,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { IconType } from 'react-icons'
import { FcGoogle } from 'react-icons/fc'
import { SiBun, SiPostgresql, SiPrisma, SiRedis, SiTypescript, SiVite } from 'react-icons/si'
import {
  TbActivity,
  TbArrowRight,
  TbBolt,
  TbBrandGithub,
  TbBrandReact,
  TbChecklist,
  TbChevronRight,
  TbCode,
  TbDashboard,
  TbDeviceDesktopAnalytics,
  TbFeather,
  TbLayoutDashboard,
  TbLogin,
  TbPlugConnected,
  TbShieldLock,
  TbSparkles,
  TbUsers,
  TbWebhook,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/')({
  component: HomePage,
})

interface Feature {
  icon: IconType
  color: string
  badge: string
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: TbLayoutDashboard,
    color: 'blue',
    badge: 'Core',
    title: 'Project Manager',
    description:
      'Rencanakan project, kelola anggota tim, set milestone, dan pantau progress dengan role-based access (Owner, PM, Member, Viewer).',
  },
  {
    icon: TbChecklist,
    color: 'violet',
    badge: 'Workflow',
    title: 'Task Workflow',
    description:
      'Task, bug, dan QC item dengan prioritas, dependensi, checklist, tag, komentar, dan riwayat status lengkap.',
  },
  {
    icon: TbActivity,
    color: 'teal',
    badge: 'Realtime',
    title: 'pm-watch Activity',
    description:
      'Agent ActivityWatch stream event aktivitas nyata ke dashboard — lihat apa yang setiap mesin benar-benar lakukan.',
  },
  {
    icon: TbWebhook,
    color: 'orange',
    badge: 'Security',
    title: 'Secure Webhooks',
    description:
      'DB-backed webhook token dengan SHA-256 hashing, show-once secret, expiry preset, dan audit trail lengkap.',
  },
  {
    icon: TbDeviceDesktopAnalytics,
    color: 'cyan',
    badge: 'DevTools',
    title: 'Live Dev Console',
    description:
      'React Flow visualisasi schema, routes, env vars, dependencies, sessions, dan live request stream realtime.',
  },
  {
    icon: TbShieldLock,
    color: 'red',
    badge: 'Auth',
    title: 'Auth & RBAC',
    description:
      'Session cookie, Google OAuth, dan 4 roles (USER · QC · ADMIN · SUPER_ADMIN) dengan route-level guards.',
  },
]

interface TechItem {
  icon: IconType
  label: string
  color: string
}

const stack: TechItem[] = [
  { icon: SiBun, label: 'Bun', color: '#f9b94c' },
  { icon: TbFeather, label: 'Elysia', color: '#a855f7' },
  { icon: TbBrandReact, label: 'React 19', color: '#61dafb' },
  { icon: SiVite, label: 'Vite 8', color: '#bd34fe' },
  { icon: SiTypescript, label: 'TypeScript', color: '#3178c6' },
  { icon: SiPrisma, label: 'Prisma', color: '#5a67d8' },
  { icon: SiPostgresql, label: 'PostgreSQL', color: '#336791' },
  { icon: SiRedis, label: 'Redis', color: '#dc382d' },
]

const stats = [
  { value: '4', label: 'Roles', icon: TbUsers },
  { value: '50+', label: 'API Endpoints', icon: TbBolt },
  { value: '10', label: 'Visualizations', icon: TbCode },
  { value: 'WS', label: 'Realtime Sync', icon: TbActivity },
]

function HomePage() {
  const { data } = useSession()
  const user = data?.user
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  const dashboardHref = user ? getDefaultRoute(user.role) : '/login'

  return (
    <Box
      mih="100dvh"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: isDark ? '#0d0e12' : '#f4f5f8',
      }}
    >
      {/* ── Navbar ──────────────────────────────── */}
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
              <Text fw={800} size="md" style={{ letterSpacing: '-0.03em' }}>
                PM Dashboard
              </Text>
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

      {/* ── Hero ─────────────────────────────────── */}
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
            {/* Badge */}
            <Box
              mb="xl"
              px={14}
              py={6}
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

            {/* Headline */}
            <Title
              order={1}
              ta="center"
              mb="xl"
              style={{
                fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
                lineHeight: 1.08,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                maxWidth: 820,
              }}
            >
              Dashboard modern untuk{' '}
              <Text
                span
                inherit
                style={{
                  background: 'var(--app-brand-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                tim yang bergerak cepat
              </Text>
            </Title>

            {/* Subtitle */}
            <Text
              c="dimmed"
              ta="center"
              size="lg"
              maw={600}
              mb={40}
              lh={1.7}
              style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)' }}
            >
              Rencanakan project, lacak task real-time, ingest aktivitas dari setiap mesin, dan audit setiap webhook — dalam satu stack Bun + React.
            </Text>

            {/* CTA buttons */}
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
                    component="a"
                    href="https://github.com/bipproduction"
                    target="_blank"
                    size="lg"
                    variant="default"
                    leftSection={<FcGoogle size={18} />}
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

            {/* Stats row */}
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
                      <Text
                        fw={900}
                        size="xl"
                        style={{
                          letterSpacing: '-0.04em',
                          background: 'var(--app-brand-gradient)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          lineHeight: 1.1,
                          marginBottom: 4,
                        }}
                      >
                        {s.value}
                      </Text>
                      <Text c="dimmed" size="xs" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                        {s.label}
                      </Text>
                    </Box>
                  )
                })}
              </SimpleGrid>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* ── Features ──────────────────────────────── */}
      <Container size="lg" py={{ base: 60, sm: 100 }}>
        <Stack gap={0}>
          <Stack gap="sm" align="center" mb={56}>
            <Box
              px={12}
              py={5}
              style={{
                borderRadius: 999,
                border: '1px solid var(--app-border-strong)',
                background: isDark ? 'rgba(155,89,245,0.08)' : 'rgba(155,89,245,0.06)',
                display: 'inline-flex',
              }}
            >
              <Text size="xs" fw={700} style={{ color: 'var(--app-brand-to)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Fitur Unggulan
              </Text>
            </Box>
            <Title
              order={2}
              ta="center"
              style={{
                fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                maxWidth: 560,
              }}
            >
              Semua yang dibutuhkan tim kecil
            </Title>
            <Text c="dimmed" ta="center" maw={480} lh={1.7}>
              Auth, RBAC, realtime presence, audit log, dan visual dev tooling — sudah built-in, tanpa konfigurasi tambahan.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <Card
                  key={f.title}
                  radius="xl"
                  p="xl"
                  className="card-hover"
                  style={{
                    height: '100%',
                    border: '1px solid var(--app-border)',
                    backgroundColor: 'var(--app-surface)',
                  }}
                >
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                      <ThemeIcon
                        variant="gradient"
                        gradient={{ from: f.color, to: f.color, deg: 135 }}
                        size={44}
                        radius="md"
                        style={{ opacity: 0.9 }}
                      >
                        <Icon size={22} />
                      </ThemeIcon>
                      <Box
                        px={8}
                        py={3}
                        style={{
                          borderRadius: 6,
                          border: '1px solid var(--app-border)',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
                        }}
                      >
                        {f.badge}
                      </Box>
                    </Group>
                    <Box>
                      <Text fw={700} size="md" mb={6} style={{ letterSpacing: '-0.02em' }}>
                        {f.title}
                      </Text>
                      <Text c="dimmed" size="sm" lh={1.7}>
                        {f.description}
                      </Text>
                    </Box>
                    <Group gap={4} mt="auto">
                      <Text size="xs" c="dimmed" fw={500}>Pelajari lebih</Text>
                      <TbChevronRight size={12} color="var(--mantine-color-dimmed)" />
                    </Group>
                  </Stack>
                </Card>
              )
            })}
          </SimpleGrid>
        </Stack>
      </Container>

      {/* ── Tech stack ────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--app-border)', borderBottom: '1px solid var(--app-border)' }}>
        <Container size="lg" py={{ base: 40, sm: 60 }}>
          <Stack gap="xl" align="center">
            <Group gap={8}>
              <TbBolt size={16} color="var(--app-brand-from)" />
              <Text fw={700} size="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
                Dibangun dengan teknologi terbaik
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 4, sm: 8 }} spacing="xl" w="100%">
              {stack.map((t) => {
                const Icon = t.icon
                return (
                  <Stack key={t.label} align="center" gap={8}>
                    <Box
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        border: '1px solid var(--app-border)',
                        backgroundColor: 'var(--app-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 150ms ease, box-shadow 150ms ease',
                      }}
                      className="tech-icon"
                    >
                      <Icon size={22} color={t.color} />
                    </Box>
                    <Text size="xs" c="dimmed" fw={600} ta="center">
                      {t.label}
                    </Text>
                  </Stack>
                )
              })}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      {/* ── CTA Banner ────────────────────────────── */}
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
          {/* Background glow */}
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
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                }}
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
                <Text size="xs" c="dimmed" ta="center">
                  Gratis · Tidak perlu kartu kredit
                </Text>
              )}
            </Stack>
          </Group>
        </Box>
      </Container>

      {/* ── Footer ────────────────────────────────── */}
      <Box
        style={{
          borderTop: '1px solid var(--app-border)',
          marginTop: 'auto',
        }}
      >
        <Container size="lg" py="lg">
          <Group justify="space-between" wrap="wrap" gap="md">
            <Group gap={8}>
              <Box
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'var(--app-brand-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TbDashboard size={13} color="#fff" />
              </Box>
              <Text size="sm" c="dimmed">
                PM Dashboard · © {new Date().getFullYear()}
              </Text>
            </Group>
            <Group gap="lg">
              <Anchor component={Link} to="/login" size="sm" c="dimmed" fw={500}>
                Login
              </Anchor>
              <Anchor
                href="https://github.com/bipproduction"
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                c="dimmed"
                fw={500}
              >
                <Group gap={4} wrap="nowrap">
                  <TbBrandGithub size={14} />
                  GitHub
                </Group>
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
