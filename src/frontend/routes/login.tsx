import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from '@mantine/core'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import {
  TbAlertCircle,
  TbArrowRight,
  TbBrandGithub,
  TbChecklist,
  TbLayoutDashboard,
  TbLock,
  TbMail,
  TbShieldCheck,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useLogin } from '@/frontend/hooks/useAuth'
import { authClient } from '@/frontend/lib/authClient'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = typeof search.error === 'string' ? search.error : undefined
    return error ? { error } : {}
  },
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (data?.user) {
        throw redirect({ to: getDefaultRoute(data.user.role) })
      }
    } catch (e) {
      if (e instanceof Error) return
      throw e
    }
  },
  component: LoginPage,
})

const highlights = [
  { icon: TbLayoutDashboard, text: 'Project & task management' },
  { icon: TbChecklist, text: 'QC ticketing & audit trail' },
  { icon: TbShieldCheck, text: 'Role-based access control' },
]

function LoginPage() {
  const login = useLogin()
  const { error: searchError } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <Box style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <Group
        justify="space-between"
        px={{ base: 'md', sm: 'xl' }}
        py="sm"
        style={{ borderBottom: '1px solid var(--app-border)' }}
      >
        <Group gap="xs">
          <Box
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--app-brand-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TbLayoutDashboard size={16} color="#fff" />
          </Box>
          <Text fw={700} size="sm" style={{ letterSpacing: '-0.02em' }}>
            PM Dashboard
          </Text>
        </Group>
        <Group gap="xs">
          <ThemeToggle />
          <Anchor
            href="https://github.com/bipproduction"
            target="_blank"
            rel="noopener noreferrer"
            c="dimmed"
            underline="never"
            visibleFrom="sm"
          >
            <TbBrandGithub size={18} />
          </Anchor>
        </Group>
      </Group>

      {/* Main */}
      <Box style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {/* Left panel — desktop only */}
        <Box
          visibleFrom="md"
          style={{
            flex: 1,
            background: isDark
              ? 'linear-gradient(160deg, #111420 0%, #0d0e12 50%, #130e1a 100%)'
              : 'linear-gradient(160deg, #eef2ff 0%, #f4f5f8 50%, #f0ebff 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '3rem 4rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background orbs */}
          <Box
            style={{
              position: 'absolute',
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(79,124,255,0.15) 0%, transparent 70%)',
              top: '-80px',
              left: '-80px',
              pointerEvents: 'none',
            }}
          />
          <Box
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(155,89,245,0.12) 0%, transparent 70%)',
              bottom: '60px',
              right: '-40px',
              pointerEvents: 'none',
            }}
          />

          <Stack gap="xl" style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
            <Box>
              <Text
                size="xs"
                fw={700}
                tt="uppercase"
                style={{ letterSpacing: '0.1em', color: 'var(--app-brand-from)', marginBottom: 12 }}
              >
                Selamat datang
              </Text>
              <Title
                order={1}
                style={{
                  fontSize: '2.25rem',
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                }}
              >
                Satu platform
                <br />
                untuk semua{' '}
                <Text
                  span
                  inherit
                  style={{
                    background: 'var(--app-brand-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  proyek tim
                </Text>
              </Title>
            </Box>

            <Text c="dimmed" size="md" lh={1.7}>
              Kelola project, lacak task, audit webhook, dan pantau aktivitas tim — semuanya dalam satu tempat.
            </Text>

            <Stack gap="sm">
              {highlights.map((h) => {
                const Icon = h.icon
                return (
                  <Group key={h.text} gap="sm">
                    <ThemeIcon
                      variant="gradient"
                      gradient={{ from: 'var(--app-brand-from)', to: 'var(--app-brand-to)', deg: 135 }}
                      size={32}
                      radius="md"
                    >
                      <Icon size={16} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {h.text}
                    </Text>
                  </Group>
                )
              })}
            </Stack>

            <Group gap={6} mt="xs">
              {['Bun', 'Elysia', 'React 19', 'Prisma', 'PostgreSQL'].map((t) => (
                <Box
                  key={t}
                  px={10}
                  py={4}
                  style={{
                    borderRadius: 6,
                    border: '1px solid var(--app-border-strong)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                    fontFamily: 'var(--app-font-mono)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {t}
                </Box>
              ))}
            </Group>
          </Stack>
        </Box>

        {/* Right panel — login form */}
        <Box
          style={{
            width: '100%',
            maxWidth: '480px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '2rem 1.5rem',
          }}
        >
          <Stack gap="xl" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            {/* Header */}
            <Stack gap={6}>
              <Title
                order={2}
                style={{ fontSize: '1.625rem', fontWeight: 800, letterSpacing: '-0.03em' }}
              >
                Masuk ke akun
              </Title>
              <Text c="dimmed" size="sm">
                Belum punya akun?{' '}
                <Anchor href="https://github.com/bipproduction" target="_blank" size="sm" fw={500}>
                  Lihat dokumentasi
                </Anchor>
              </Text>
            </Stack>

            {/* Google button */}
            <Button
              fullWidth
              variant="default"
              size="md"
              leftSection={<FcGoogle size={18} />}
              rightSection={<TbArrowRight size={14} />}
              onClick={() =>
                authClient.signIn.social({
                  provider: 'google',
                  callbackURL: '/admin',
                  errorCallbackURL: '/login?error=google_failed',
                })
              }
              styles={{
                root: {
                  height: 44,
                  fontWeight: 600,
                  border: '1px solid var(--app-border-strong)',
                  backgroundColor: 'var(--app-surface)',
                  '&:hover': { backgroundColor: 'var(--app-surface-elevated)' },
                },
              }}
            >
              Lanjutkan dengan Google
            </Button>

            <Divider
              label={
                <Text size="xs" c="dimmed" fw={500}>
                  atau email & password
                </Text>
              }
              labelPosition="center"
            />

            {/* Error */}
            {(login.isError || searchError) && (
              <Alert
                icon={<TbAlertCircle size={15} />}
                color="red"
                variant="light"
                radius="md"
                styles={{ message: { fontSize: '0.8125rem' } }}
              >
                {login.isError ? login.error.message : 'Login dengan Google gagal. Coba lagi.'}
              </Alert>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="nama@perusahaan.com"
                  leftSection={<TbMail size={15} />}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  required
                  size="md"
                  styles={{
                    label: { fontWeight: 600, fontSize: '0.8125rem', marginBottom: 6 },
                    input: { height: 44 },
                  }}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Masukkan password"
                  leftSection={<TbLock size={15} />}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                  size="md"
                  styles={{
                    label: { fontWeight: 600, fontSize: '0.8125rem', marginBottom: 6 },
                    input: { height: 44 },
                  }}
                />
                <Button
                  type="submit"
                  fullWidth
                  size="md"
                  loading={login.isPending}
                  style={{
                    height: 44,
                    background: 'var(--app-brand-gradient)',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    border: 'none',
                    marginTop: 4,
                  }}
                >
                  {login.isPending ? 'Memproses...' : 'Sign in'}
                </Button>
              </Stack>
            </form>

            <Text size="xs" c="dimmed" ta="center" lh={1.6}>
              Dengan masuk, kamu menyetujui syarat penggunaan internal platform ini.
            </Text>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
