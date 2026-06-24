import { Badge, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import type { RetroTaskRow } from './types'
import { fmtDate } from './types'

export function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <Badge color={color} variant="light" size="lg">
          {title}
        </Badge>
      </Group>
      <Stack gap={4}>{children}</Stack>
    </Card>
  )
}

export function TaskLine({ task, suffix }: { task: RetroTaskRow; suffix?: string }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge size="xs" variant="outline" color="gray">
        {task.priority}
      </Badge>
      <Text size="sm" style={{ flex: 1 }} truncate>
        {task.title}
      </Text>
      <Text size="xs" c="dimmed">
        {task.assigneeEmail ?? 'unassigned'}
      </Text>
      {suffix && (
        <Text size="xs" c="dimmed">
          {suffix}
        </Text>
      )}
    </Group>
  )
}

export function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon variant="light" color={color} size="md">
          {icon}
        </ThemeIcon>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
            {label}
          </Text>
          <Text fw={700} size="lg">
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  )
}

export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500} tt="uppercase">
        {label}
      </Text>
      <Text fw={700} size="lg" c={color}>
        {value}
      </Text>
    </div>
  )
}

export { fmtDate }
