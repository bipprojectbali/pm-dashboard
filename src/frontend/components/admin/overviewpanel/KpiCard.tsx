import { Card, Group, Skeleton, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbInfoCircle, type TbUsers } from 'react-icons/tb'

export function KpiCard({
  label,
  value,
  sub,
  subColor,
  icon: Icon,
  color,
  onClick,
  loading,
  info,
}: {
  label: string
  value: number
  sub?: string
  subColor?: string
  icon: typeof TbUsers
  color: string
  onClick?: () => void
  loading?: boolean
  info?: string
}) {
  return (
    <Card withBorder padding="lg" radius="md" style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={500} tt="uppercase">
              {label}
            </Text>
            {info && (
              <Tooltip multiline w={280} withArrow label={info}>
                <ThemeIcon
                  variant="subtle"
                  color="gray"
                  size="xs"
                  radius="xl"
                  style={{ cursor: 'help' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <TbInfoCircle size={12} />
                </ThemeIcon>
              </Tooltip>
            )}
          </Group>
          {loading ? (
            <Skeleton height={28} width={60} radius="sm" my={2} />
          ) : (
            <Text fw={700} size="xl">
              {value}
            </Text>
          )}
          {loading ? (
            <Skeleton height={12} width={100} radius="sm" />
          ) : (
            sub && (
              <Text size="xs" c={subColor ?? 'dimmed'}>
                {sub}
              </Text>
            )
          )}
        </Stack>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}
