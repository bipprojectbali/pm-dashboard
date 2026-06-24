import { Card, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { InfoTip } from '../../shared/InfoTip'

export function ChartCard({
  title,
  subtitle,
  tip,
  children,
}: {
  title: string
  subtitle?: string
  tip?: string
  children: ReactNode
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <div>
          <Group gap={4} wrap="nowrap">
            <Text fw={600} size="sm">
              {title}
            </Text>
            {tip && <InfoTip label={tip} size={12} />}
          </Group>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </div>
        {children}
      </Stack>
    </Card>
  )
}
