import { Card, Group, Text, ThemeIcon } from '@mantine/core'
import type { IconType } from 'react-icons'
import { InfoTip } from '@/frontend/components/shared/InfoTip'

export function MiniStat({
  label,
  value,
  icon: Icon,
  color,
  tip,
}: {
  label: string
  value: number
  icon: IconType
  color: string
  tip?: string
}) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon variant="light" color={color} size="md" radius="md">
          <Icon size={16} />
        </ThemeIcon>
        <div style={{ flex: 1 }}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={500}>
              {label}
            </Text>
            {tip && <InfoTip label={tip} size={11} />}
          </Group>
          <Text fw={700} size="lg">
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  )
}
