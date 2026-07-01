import { Badge, Group, Paper, Text } from '@mantine/core'

export function PhasePill({
  label,
  count,
  active,
  color,
  leftSection,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  color: string
  leftSection?: React.ReactNode
  onClick: () => void
}) {
  return (
    <Badge
      color={color}
      variant={active ? 'filled' : 'light'}
      size="sm"
      leftSection={leftSection}
      style={{ cursor: 'pointer', userSelect: 'none', ...(active ? { color: 'white' } : {}) }}
      onClick={onClick}
    >
      {label}
      {count !== undefined ? ` · ${count}` : ''}
    </Badge>
  )
}

export function PhaseRow({
  title,
  count,
  active,
  color,
  leftSection,
  onClick,
}: {
  title: string
  count?: number
  active: boolean
  color: string
  leftSection?: React.ReactNode
  onClick: () => void
}) {
  return (
    <Paper
      withBorder
      radius="sm"
      px="xs"
      py={4}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        borderLeft: `3px solid var(--mantine-color-${color}-5)`,
        background: active ? `var(--mantine-color-${color}-light)` : undefined,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {leftSection}
          <Text size="xs" fw={active ? 600 : 500} truncate style={{ minWidth: 0 }}>
            {title}
          </Text>
        </Group>
        {count !== undefined && (
          <Badge size="xs" variant="default" color="gray" style={{ flexShrink: 0 }}>
            {count} task
          </Badge>
        )}
      </Group>
    </Paper>
  )
}
