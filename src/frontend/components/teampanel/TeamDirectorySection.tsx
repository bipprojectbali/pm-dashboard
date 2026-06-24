import { Badge, Card, Divider, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { TbUsers } from 'react-icons/tb'
import { EmptyState } from '@/frontend/components/shared/EmptyState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { ROLE_COLOR, type Teammate } from './types'

type Props = {
  isLoading: boolean
  sorted: Teammate[]
  onlineSet: Set<string>
  onProjectClick: (projectId: string) => void
}

export function TeamDirectorySection({ isLoading, sorted, onlineSet, onProjectClick }: Props) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group gap="xs" mb="md" justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="violet" size="md" radius="md">
            <TbUsers size={16} />
          </ThemeIcon>
          <div>
            <Title order={5}>Direktori Teman</Title>
            <Text size="xs" c="dimmed">
              Semua teman yang berbagi proyek dengan kamu.
            </Text>
          </div>
        </Group>
        <Badge variant="light">{sorted.length} orang</Badge>
      </Group>
      {isLoading ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Memuat…
        </Text>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={TbUsers}
          title="Belum ada teman se-proyek"
          message="Tambahkan anggota ke salah satu proyek kamu dari tab Proyek."
          variant="inline"
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {sorted.map((t) => {
            const isOnline = onlineSet.has(t.id)
            return (
              <Card key={t.id} withBorder padding="md" radius="md">
                <Group gap="sm" mb="sm" wrap="nowrap">
                  <div style={{ position: 'relative' }}>
                    <UserAvatar name={t.name} image={t.image} size="md" color={ROLE_COLOR[t.role] ?? 'gray'} />
                    {isOnline && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-green-6)',
                          border: '2px solid var(--mantine-color-body)',
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {t.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {t.email}
                    </Text>
                  </div>
                  <Badge color={ROLE_COLOR[t.role] ?? 'gray'} variant="light" size="xs">
                    {t.role}
                  </Badge>
                </Group>
                <Group gap="xs" mb="sm">
                  <Badge variant="light" color="blue" size="xs">
                    {t.openTasks} task
                  </Badge>
                  {t.overdueTasks > 0 && (
                    <Badge variant="light" color="red" size="xs">
                      {t.overdueTasks} telat
                    </Badge>
                  )}
                </Group>
                <Divider mb="xs" />
                <Text size="xs" c="dimmed" fw={500} mb={4}>
                  PROYEK BERSAMA
                </Text>
                <Stack gap={2}>
                  {t.sharedProjects.slice(0, 3).map((p) => (
                    <UnstyledButton
                      key={p.projectId}
                      onClick={() => onProjectClick(p.projectId)}
                      style={{ borderRadius: 4, padding: '2px 4px' }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Text size="xs" truncate style={{ flex: 1 }}>
                          {p.projectName}
                        </Text>
                        <Badge size="xs" variant="dot" color={ROLE_COLOR[p.theirRole] ?? 'gray'}>
                          {p.theirRole}
                        </Badge>
                      </Group>
                    </UnstyledButton>
                  ))}
                  {t.sharedProjects.length > 3 && (
                    <Text size="xs" c="dimmed">
                      +{t.sharedProjects.length - 3} proyek lainnya
                    </Text>
                  )}
                </Stack>
              </Card>
            )
          })}
        </SimpleGrid>
      )}
    </Paper>
  )
}
