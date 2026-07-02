import { Badge, Box, Button, NavLink } from '@mantine/core'

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
    <Button
      variant={active ? 'filled' : 'light'}
      color={color}
      size="compact-xs"
      radius="xl"
      leftSection={leftSection}
      onClick={onClick}
    >
      {label}
      {count !== undefined ? ` · ${count}` : ''}
    </Button>
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
    <NavLink
      label={title}
      active={active}
      color={color}
      variant="light"
      leftSection={leftSection ? <Box c={`${color}.5`}>{leftSection}</Box> : undefined}
      rightSection={
        count !== undefined ? (
          <Badge size="xs" variant={active ? 'filled' : 'default'} color={active ? color : undefined}>
            {count} task
          </Badge>
        ) : undefined
      }
      onClick={onClick}
      styles={{
        root: { borderRadius: 'var(--mantine-radius-sm)' },
        label: { fontSize: 'var(--mantine-font-size-xs)', fontWeight: active ? 600 : 500 },
      }}
    />
  )
}
