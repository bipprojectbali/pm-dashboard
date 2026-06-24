import { Box, Text, UnstyledButton } from '@mantine/core'

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: 0.6 }}>
      {children}
    </Text>
  )
}

export function PillButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <UnstyledButton onClick={onClick}>
      <Box
        style={{
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 500,
          border: '1px solid',
          borderColor: active ? `var(--mantine-color-${color}-filled)` : 'var(--mantine-color-default-border)',
          backgroundColor: active ? `var(--mantine-color-${color}-filled)` : 'transparent',
          color: active ? 'var(--mantine-color-white)' : 'var(--mantine-color-text)',
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        {children}
      </Box>
    </UnstyledButton>
  )
}
