import { Card, Group, Loader, Text, ThemeIcon, Title } from '@mantine/core'
import type { IconType } from 'react-icons'

export function SectionHeader({
  icon: Icon,
  color,
  title,
  subtitle,
}: {
  icon: IconType
  color: string
  title: string
  subtitle?: string
}) {
  return (
    <Group gap="xs" mb={4}>
      <ThemeIcon variant="light" color={color} size="md" radius="md">
        <Icon size={16} />
      </ThemeIcon>
      <div>
        <Title order={4}>{title}</Title>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </div>
    </Group>
  )
}

export function RiskStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card withBorder padding="xs" radius="md" bg="var(--mantine-color-default-hover)">
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        {label}
      </Text>
      <Text size="xl" fw={700} c={value > 0 ? color : undefined}>
        {value}
      </Text>
    </Card>
  )
}

export function PdfOverlay({
  state,
}: {
  state: { busy: boolean; progress?: { done: number; total: number }; error?: string }
}) {
  if (!state.busy && !state.error) return null
  return (
    <div
      data-html2canvas-ignore="true"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        minWidth: 220,
      }}
    >
      {state.error ? (
        <Text size="sm" c="red" fw={600}>
          Gagal membuat PDF: {state.error}
        </Text>
      ) : (
        <Group gap="xs" align="center">
          <Loader size="xs" />
          <Text size="sm" fw={600}>
            Membuat PDF
            {state.progress && state.progress.total > 0
              ? ` (${state.progress.done}/${state.progress.total})`
              : '…'}
          </Text>
        </Group>
      )}
    </div>
  )
}
