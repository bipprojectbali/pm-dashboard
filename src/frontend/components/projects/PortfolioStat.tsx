import { Card, Group, Text } from '@mantine/core'

export function PortfolioStat({
  label,
  value,
  color,
  icon,
  active,
  muted,
  onClick,
}: {
  label: string
  value: number
  color: string
  icon?: React.ReactNode
  active?: boolean
  muted?: boolean
  onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <Card
      withBorder
      padding="xs"
      radius="md"
      onClick={onClick}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        borderColor: active ? `var(--mantine-color-${color}-outline)` : undefined,
        backgroundColor: active ? `var(--mantine-color-${color}-light)` : undefined,
        opacity: muted ? 0.55 : 1,
        transition: 'all 120ms ease',
      }}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ minWidth: 0 }} truncate>
          {icon ? <span style={{ marginRight: 4, verticalAlign: 'middle' }}>{icon}</span> : null}
          {label}
        </Text>
        <Text fw={700} size="lg" c={value > 0 ? color : 'dimmed'}>
          {value}
        </Text>
      </Group>
    </Card>
  )
}
