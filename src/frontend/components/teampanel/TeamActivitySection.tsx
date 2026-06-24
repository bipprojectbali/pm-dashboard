import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { TbActivity, TbArrowRight, TbCircleCheck, TbMessage } from 'react-icons/tb'
import { EmptyState } from '@/frontend/components/shared/EmptyState'
import { STATUS_COLOR, formatRelativeTime, type TeamActivityItem } from './types'

type Props = {
  isLoading: boolean
  activity: TeamActivityItem[]
  onTaskClick: (taskId: string, projectId: string) => void
}

export function TeamActivitySection({ isLoading, activity, onTaskClick }: Props) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group gap="xs" mb="md">
        <ThemeIcon variant="light" color="grape" size="md" radius="md">
          <TbActivity size={16} />
        </ThemeIcon>
        <div>
          <Title order={5}>Aktivitas Tim</Title>
          <Text size="xs" c="dimmed">
            Perubahan status & komentar di proyek kamu, 7 hari terakhir.
          </Text>
        </div>
      </Group>
      {isLoading ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Memuat…
        </Text>
      ) : activity.length === 0 ? (
        <EmptyState
          icon={TbActivity}
          title="Belum ada aktivitas tim"
          message="Status task atau komentar baru akan muncul di sini saat tim mulai bergerak."
          variant="inline"
        />
      ) : (
        <Stack gap={4}>
          {activity.slice(0, 12).map((a) => (
            <UnstyledButton
              key={a.id}
              onClick={() => onTaskClick(a.task.id, a.task.projectId)}
              style={{ borderRadius: 6, padding: '8px 10px' }}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" color={a.kind === 'COMMENT' ? 'grape' : 'teal'} size="sm" radius="xl">
                  {a.kind === 'COMMENT' ? <TbMessage size={12} /> : <TbCircleCheck size={12} />}
                </ThemeIcon>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500}>
                      {a.author?.name ?? 'Seseorang'}
                    </Text>
                    {a.kind === 'STATUS_CHANGE' && a.detail.fromStatus && a.detail.toStatus ? (
                      <Group gap={4} wrap="nowrap">
                        <Badge size="xs" variant="light" color={STATUS_COLOR[a.detail.fromStatus] ?? 'gray'}>
                          {a.detail.fromStatus}
                        </Badge>
                        <TbArrowRight size={12} />
                        <Badge size="xs" variant="light" color={STATUS_COLOR[a.detail.toStatus] ?? 'gray'}>
                          {a.detail.toStatus}
                        </Badge>
                      </Group>
                    ) : (
                      <Text size="xs" c="dimmed">
                        berkomentar
                      </Text>
                    )}
                  </Group>
                  <Text size="sm" truncate>
                    {a.task.title}
                  </Text>
                  {a.kind === 'COMMENT' && a.detail.body && (
                    <Text size="xs" c="dimmed" truncate>
                      "{a.detail.body}"
                    </Text>
                  )}
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed" truncate>
                      {a.project?.name ?? ''}
                    </Text>
                    <Text size="xs" c="dimmed">
                      · {formatRelativeTime(a.createdAt)}
                    </Text>
                  </Group>
                </div>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Paper>
  )
}
