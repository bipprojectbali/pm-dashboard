import { Box, Container, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { TbBolt } from 'react-icons/tb'
import { stack } from './data'

export function TechStackSection() {
  return (
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
                  <Text size="xs" c="dimmed" fw={600} ta="center">{t.label}</Text>
                </Stack>
              )
            })}
          </SimpleGrid>
        </Stack>
      </Container>
    </Box>
  )
}
