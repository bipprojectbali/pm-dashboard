import { Badge, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { useNavigate } from '@tanstack/react-router'
import { TbFlame } from 'react-icons/tb'
import { PRIORITY_COLOR, type UserReportData } from './types'

export function OverdueList({
  tasks,
  navigate,
  className,
}: {
  tasks: UserReportData['overdueTasks']
  navigate: ReturnType<typeof useNavigate>
  className?: string
}) {
  if (tasks.length === 0) {
    return (
      <Card withBorder padding="md" radius="md" className={className}>
        <Text size="sm" c="dimmed" ta="center" py="sm">
          Tidak ada task overdue untuk user ini.
        </Text>
      </Card>
    )
  }

  return (
    <Card withBorder padding="md" radius="md" className={className}>
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="red" size="md" radius="md">
          <TbFlame size={16} />
        </ThemeIcon>
        <Title order={5}>Overdue — top 5</Title>
      </Group>
      <Stack gap={6}>
        {tasks.map((t) => (
          <Group key={t.id} gap="xs" wrap="nowrap">
            <Badge size="xs" color={PRIORITY_COLOR[t.priority] ?? 'gray'} variant="outline">
              {t.priority}
            </Badge>
            <Text
              size="sm"
              style={{ flex: 1, cursor: 'pointer' }}
              truncate
              onClick={() => navigate({ to: '/admin', search: { tab: 'tasks' } })}
            >
              {t.title}
            </Text>
            <Text size="xs" c="dimmed">
              {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '—'}
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
