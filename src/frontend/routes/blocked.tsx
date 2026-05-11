import { Box, Button, Group, Stack, Text, Title, useMantineColorScheme } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { TbLayoutDashboard, TbLogout, TbShieldOff } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { useLogout } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/blocked')({
  component: BlockedPage,
})

function BlockedPage() {
  const logout = useLogout()
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <Box
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark
          ? 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(240,62,62,0.08) 0%, transparent 70%), #0d0e12'
          : 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(240,62,62,0.06) 0%, transparent 70%), #f4f5f8',
        padding: '1.5rem',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <Box style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Group justify="space-between" px={{ base: 'md', sm: 'xl' }} py="sm">
          <Group gap="xs">
            <Box
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--app-brand-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TbLayoutDashboard size={14} color="#fff" />
            </Box>
            <Text fw={800} size="sm" style={{ letterSpacing: '-0.02em' }}>PM Dashboard</Text>
          </Group>
          <ThemeToggle />
        </Group>
      </Box>

      {/* Content */}
      <Stack
        align="center"
        gap="xl"
        style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}
      >
        {/* Icon */}
        <Box
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: isDark ? 'rgba(240,62,62,0.1)' : 'rgba(240,62,62,0.08)',
            border: '1px solid rgba(240,62,62,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(240,62,62,0.12)',
          }}
        >
          <TbShieldOff size={38} color="#f03e3e" />
        </Box>

        {/* Text */}
        <Stack gap="sm" align="center">
          <Title
            order={2}
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
            }}
          >
            Akun Diblokir
          </Title>
          <Text c="dimmed" size="md" lh={1.7} maw={360}>
            Akun kamu telah dinonaktifkan oleh administrator. Hubungi admin untuk informasi lebih lanjut atau untuk mengajukan pemulihan akses.
          </Text>
        </Stack>

        {/* Info box */}
        <Box
          p="lg"
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1px solid var(--app-border-strong)',
            backgroundColor: 'var(--app-surface)',
          }}
        >
          <Stack gap="sm">
            <Text size="sm" fw={700} style={{ letterSpacing: '-0.01em' }}>
              Apa yang harus dilakukan?
            </Text>
            {[
              'Hubungi administrator melalui email atau saluran komunikasi tim',
              'Jelaskan situasi dan minta pembukaan blokir',
              'Tunggu konfirmasi dari tim admin',
            ].map((item, i) => (
              <Group key={i} gap="sm" align="flex-start">
                <Box
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--app-brand-gradient)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  <Text size="xs" fw={800} style={{ color: '#fff', fontSize: '0.6rem' }}>{i + 1}</Text>
                </Box>
                <Text size="sm" c="dimmed" lh={1.6} style={{ flex: 1, textAlign: 'left' }}>
                  {item}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>

        {/* Logout button */}
        <Button
          fullWidth
          size="md"
          color="red"
          variant="light"
          leftSection={<TbLogout size={17} />}
          onClick={() => logout.mutate()}
          loading={logout.isPending}
          style={{ height: 46, fontWeight: 700 }}
        >
          Keluar dari akun
        </Button>
      </Stack>
    </Box>
  )
}
