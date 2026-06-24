import { Badge, Card, Group, Skeleton, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbActivity, TbInfoCircle } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { ACTION_COLOR, formatRelative } from './constants'
import type { AuditLogEntry } from './types'

export function RecentActivityCard({
  logs,
  isLoading,
}: {
  logs: AuditLogEntry[]
  isLoading: boolean
}) {
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <TbActivity size={16} />
            <Title order={5}>Aktivitas Terbaru</Title>
            <Tooltip
              multiline
              w={320}
              withArrow
              label="8 entri terakhir dari audit log: login/logout, perubahan role, block/unblock user, persetujuan/revoke agent, dan perubahan peran project-member. Badge berwarna menunjukkan jenis aksi."
            >
              <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
                <TbInfoCircle size={14} />
              </ThemeIcon>
            </Tooltip>
          </Group>
          <Text size="xs" c="dimmed">
            last 8 entries
          </Text>
        </Group>
        {isLoading && (
          <Stack gap="xs">
            {['a', 'b', 'c', 'd'].map((k) => (
              <Group key={k} gap="sm" wrap="nowrap">
                <Skeleton height={18} width={80} radius="sm" />
                <Skeleton height={14} style={{ flex: 1 }} radius="sm" />
                <Skeleton height={12} width={50} radius="sm" />
              </Group>
            ))}
          </Stack>
        )}
        {logs.length === 0 && !isLoading && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Belum ada aktivitas.
          </Text>
        )}
        {logs.map((log) => (
          <Group key={log.id} gap="sm" wrap="nowrap" align="flex-start">
            <Badge color={ACTION_COLOR[log.action] ?? 'gray'} variant="light" size="sm">
              {log.action}
            </Badge>
            {log.user && (
              <UserAvatar
                name={log.user.name}
                image={log.user.image}
                size={20}
                color="blue"
                style={{ flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" lineClamp={1}>
                <Text component="span" fw={500}>
                  {log.user?.name ?? 'system'}
                </Text>
                {log.detail ? (
                  <Text component="span" c="dimmed">
                    {' '}
                    — {log.detail}
                  </Text>
                ) : null}
              </Text>
            </div>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {formatRelative(log.createdAt)}
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
