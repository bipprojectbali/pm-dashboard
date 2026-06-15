import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { TbLock, TbShieldCheck, TbUsers, TbWifi } from 'react-icons/tb'
import { usePresence } from '@/frontend/hooks/usePresence'

interface AdminUser {
  id: string
  name: string
  email: string
  role: 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'
  blocked: boolean
  createdAt: string
}

const overviewStats = [
  { title: 'Total Users', icon: TbUsers, color: 'blue' },
  { title: 'Online', icon: TbWifi, color: 'green' },
  { title: 'Admin', icon: TbShieldCheck, color: 'violet' },
  { title: 'Blocked', icon: TbLock, color: 'red' },
]

export function OverviewPanel() {
  const { data } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })
  const { onlineUserIds } = usePresence()

  const users = data?.users ?? []
  const counts = {
    'Total Users': users.length,
    Online: onlineUserIds.length,
    Admin: users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length,
    Blocked: users.filter((u) => u.blocked).length,
  }

  return (
    <Stack gap="lg">
      <Title order={3}>Overview</Title>
      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        {overviewStats.map((stat) => (
          <Card key={stat.title} withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed" fw={500}>
                {stat.title}
              </Text>
              <ThemeIcon variant="light" color={stat.color} size="sm">
                <stat.icon size={14} />
              </ThemeIcon>
            </Group>
            <Text fw={700} size="xl">
              {counts[stat.title as keyof typeof counts]}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
