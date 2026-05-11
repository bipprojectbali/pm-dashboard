import { Box, Card, Group, Loader, Skeleton, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

export function SectionSkeleton({
  height = 180,
  radius = 'lg',
}: {
  height?: number | string
  radius?: string | number
}) {
  return <Skeleton height={height} radius={radius} />
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => `kpi-${i}`).map((key) => (
        <Skeleton key={key} height={100} radius="lg" />
      ))}
    </>
  )
}

export function TableSkeleton({ rows = 5, height = 36 }: { rows?: number; height?: number }) {
  return (
    <Stack gap="xs">
      <Skeleton height={height} radius="md" style={{ opacity: 0.6 }} />
      {Array.from({ length: rows }, (_, i) => `row-${i}`).map((key, i) => (
        <Skeleton
          key={key}
          height={height}
          radius="md"
          style={{ opacity: Math.max(0.15, 0.5 - i * 0.07) }}
        />
      ))}
    </Stack>
  )
}

export function LoadingBlock({
  message = 'Memuat…',
  minHeight = 140,
}: {
  message?: ReactNode
  minHeight?: number | string
}) {
  return (
    <Card withBorder radius="lg">
      <Stack gap="sm" align="center" py="xl" style={{ minHeight }}>
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(79,124,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader size="sm" color="indigo" />
        </Box>
        <Text size="sm" c="dimmed" fw={500}>
          {message}
        </Text>
      </Stack>
    </Card>
  )
}

export function InlineLoading({ message = 'Memuat…' }: { message?: ReactNode }) {
  return (
    <Group gap="xs" justify="center" py="md">
      <Loader size="xs" color="indigo" />
      <Text size="sm" c="dimmed" fw={500}>
        {message}
      </Text>
    </Group>
  )
}
