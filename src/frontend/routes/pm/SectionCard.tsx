import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'
import { InfoTip } from '@/frontend/components/shared/InfoTip'

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  color,
  count,
  countLabel,
  loading,
  emptyMessage,
  action,
  tip,
  children,
}: {
  title: string
  subtitle?: string
  icon: IconType
  color: string
  count: number
  countLabel?: string
  loading?: boolean
  emptyMessage: string
  action?: ReactNode
  tip?: string
  children: ReactNode
}) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon variant="light" color={color} size="md" radius="md">
            <Icon size={16} />
          </ThemeIcon>
          <div>
            <Group gap="xs">
              <Title order={5}>{title}</Title>
              {count > 0 && (
                <Badge color={color} variant="light" size="sm">
                  {count}
                  {countLabel ? ` ${countLabel}` : ''}
                </Badge>
              )}
              {tip && <InfoTip label={tip} size={12} />}
            </Group>
            {subtitle && (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            )}
          </div>
        </Group>
        {action}
      </Group>
      {loading ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Memuat…
        </Text>
      ) : count === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {emptyMessage}
        </Text>
      ) : (
        <Stack gap={4}>{children}</Stack>
      )}
    </Paper>
  )
}
