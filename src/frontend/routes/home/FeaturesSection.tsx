import { Box, Card, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbChevronRight } from 'react-icons/tb'
import { features } from './data'

interface Props {
  isDark: boolean
}

export function FeaturesSection({ isDark }: Props) {
  return (
    <Container size="lg" py={{ base: 60, sm: 100 }}>
      <Stack gap={0}>
        <Stack gap="sm" align="center" mb={56}>
          <Box
            px={12} py={5}
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
            order={2} ta="center"
            style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 900, letterSpacing: '-0.03em', maxWidth: 560 }}
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
                style={{ height: '100%', border: '1px solid var(--app-border)', backgroundColor: 'var(--app-surface)' }}
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
                      px={8} py={3}
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
                    <Text fw={700} size="md" mb={6} style={{ letterSpacing: '-0.02em' }}>{f.title}</Text>
                    <Text c="dimmed" size="sm" lh={1.7}>{f.description}</Text>
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
  )
}
