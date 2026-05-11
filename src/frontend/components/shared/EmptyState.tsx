import { Box, Button, Card, type MantineColor, Stack, Text } from '@mantine/core'
import type { ComponentType, ReactNode } from 'react'
import { TbInbox } from 'react-icons/tb'

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number | string }>
  color?: MantineColor
  title: string
  message?: ReactNode
  ctaLabel?: string
  onCta?: () => void
  variant?: 'card' | 'inline' | 'row'
  minHeight?: number | string
}

const COLOR_MAP: Record<string, string> = {
  blue:   'rgba(79,124,255,0.1)',
  violet: 'rgba(155,89,245,0.1)',
  teal:   'rgba(32,201,151,0.1)',
  red:    'rgba(240,62,62,0.1)',
  orange: 'rgba(255,146,43,0.1)',
  cyan:   'rgba(21,170,191,0.1)',
  gray:   'rgba(134,142,150,0.08)',
  green:  'rgba(64,192,87,0.1)',
}
const COLOR_ICON: Record<string, string> = {
  blue:   '#4f7cff',
  violet: '#9b59f5',
  teal:   '#20c997',
  red:    '#f03e3e',
  orange: '#ff922b',
  cyan:   '#15aabf',
  gray:   '#868e96',
  green:  '#40c057',
}

export function EmptyState({
  icon: Icon = TbInbox,
  color = 'gray',
  title,
  message,
  ctaLabel,
  onCta,
  variant = 'card',
  minHeight,
}: EmptyStateProps) {
  const bg = COLOR_MAP[color] ?? COLOR_MAP.gray
  const iconColor = COLOR_ICON[color] ?? COLOR_ICON.gray
  const isInline = variant === 'inline'

  const body = (
    <Stack gap={isInline ? 6 : 'sm'} align="center" ta="center" py={isInline ? 'sm' : 'xl'}>
      <Box
        style={{
          width: isInline ? 36 : 52,
          height: isInline ? 36 : 52,
          borderRadius: isInline ? 10 : 14,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Box style={{ color: iconColor, display: 'flex' }}><Icon size={isInline ? 18 : 24} /></Box>
      </Box>
      <Stack gap={4} align="center">
        <Text size={isInline ? 'sm' : 'md'} fw={600} style={{ letterSpacing: '-0.01em' }}>
          {title}
        </Text>
        {message && (
          <Text size="xs" c="dimmed" maw={360} lh={1.6}>
            {message}
          </Text>
        )}
      </Stack>
      {ctaLabel && onCta && (
        <Button
          size="xs"
          variant="light"
          color={color}
          onClick={onCta}
          mt={4}
          style={{ fontWeight: 600 }}
        >
          {ctaLabel}
        </Button>
      )}
    </Stack>
  )

  if (variant === 'inline') return body
  if (variant === 'row') {
    return (
      <div
        style={{
          minHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        {body}
      </div>
    )
  }
  return (
    <Card
      withBorder
      radius="lg"
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {body}
    </Card>
  )
}

export function EmptyRow({
  icon: Icon = TbInbox,
  title,
  message,
}: {
  icon?: ComponentType<{ size?: number | string }>
  title: string
  message?: ReactNode
}) {
  return (
    <Stack gap={4} align="center" py="md">
      <Box
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: COLOR_MAP.gray,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box style={{ color: COLOR_ICON.gray, display: 'flex' }}><Icon size={15} /></Box>
      </Box>
      <Text size="sm" fw={600} style={{ letterSpacing: '-0.01em' }}>
        {title}
      </Text>
      {message && (
        <Text size="xs" c="dimmed" lh={1.6}>
          {message}
        </Text>
      )}
    </Stack>
  )
}
