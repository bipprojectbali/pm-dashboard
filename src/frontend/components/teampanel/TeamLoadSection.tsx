import { Badge, Group, Paper, Progress, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { TbListCheck, TbUsersGroup } from 'react-icons/tb'
import { EmptyState } from '@/frontend/components/shared/EmptyState'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { ROLE_COLOR, type Teammate } from './types'

type SortOption = 'load' | 'overdue' | 'name'

type Props = {
  isLoading: boolean
  sorted: Teammate[]
  onlineSet: Set<string>
  sort: SortOption
  onSortChange: (v: SortOption) => void
  maxLoad: number
}

export function TeamLoadSection({ isLoading, sorted, onlineSet, sort, onSortChange, maxLoad }: Props) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group gap="xs" mb="md" justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="md" radius="md">
            <TbListCheck size={16} />
          </ThemeIcon>
          <div>
            <Title order={5}>Beban Tim</Title>
            <Text size="xs" c="dimmed">
              Task terbuka per teman di proyek yang kamu ikuti.
            </Text>
          </div>
        </Group>
        <SegmentedControl
          size="xs"
          value={sort}
          onChange={(v) => onSortChange(v as SortOption)}
          data={[
            { label: 'Beban', value: 'load' },
            { label: 'Telat', value: 'overdue' },
            { label: 'Nama', value: 'name' },
          ]}
        />
      </Group>
      {isLoading ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Memuat…
        </Text>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={TbUsersGroup}
          title="Belum ada teman se-proyek"
          message="Tambahkan anggota ke salah satu proyek kamu untuk melihat beban tim."
          variant="inline"
        />
      ) : (
        <Stack gap="sm">
          {sorted.map((t) => {
            const isOnline = onlineSet.has(t.id)
            const loadPercent = Math.min(100, (t.openTasks / maxLoad) * 100)
            const loadColor = t.openTasks >= 10 ? 'red' : t.openTasks >= 6 ? 'orange' : 'blue'
            return (
              <div key={t.id}>
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <UserAvatar name={t.name} image={t.image} size="sm" color={ROLE_COLOR[t.role] ?? 'gray'} />
                      {isOnline && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'var(--mantine-color-green-6)',
                            border: '2px solid var(--mantine-color-body)',
                          }}
                        />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {t.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.sharedProjects.length} proyek bersama
                      </Text>
                    </div>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    {t.overdueTasks > 0 && (
                      <Badge color="red" variant="light" size="sm">
                        {t.overdueTasks} telat
                      </Badge>
                    )}
                    <Badge color={loadColor} variant="light" size="sm">
                      {t.openTasks} task
                    </Badge>
                  </Group>
                </Group>
                <Progress value={loadPercent} color={loadColor} size="sm" radius="xl" />
              </div>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}
