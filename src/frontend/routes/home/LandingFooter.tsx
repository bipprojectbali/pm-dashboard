import { Anchor, Box, Container, Group, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbBrandGithub, TbDashboard } from 'react-icons/tb'

export function LandingFooter() {
  return (
    <Box style={{ borderTop: '1px solid var(--app-border)', marginTop: 'auto' }}>
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
            <Text size="sm" c="dimmed">PM Dashboard · © {new Date().getFullYear()}</Text>
          </Group>
          <Group gap="lg">
            <Anchor component={Link} to="/login" size="sm" c="dimmed" fw={500}>Login</Anchor>
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
  )
}
