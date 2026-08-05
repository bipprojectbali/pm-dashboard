import { Badge, Card, Group, Progress, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbInfoCircle, TbUsersGroup } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import type { LoadRow } from './types'

export function TeamLoadSection({ rows, onSelectUser }: { rows: LoadRow[]; onSelectUser?: (userId: string) => void }) {
  const maxOpen = Math.max(1, ...rows.map((r) => r.open))
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="violet" size="md" radius="md">
          <TbUsersGroup size={16} />
        </ThemeIcon>
        <Title order={5}>Beban Tim</Title>
        <Tooltip
          multiline
          w={340}
          withArrow
          label="Beban kerja per user: jumlah task open, total estimasi jam, task prioritas tinggi, dan task overdue. User ditandai 'overloaded' jika open ≥10, estimasi >80 jam, atau overdue ≥3. Bar progress relatif terhadap user dengan open terbanyak. Klik baris untuk lihat laporan detail user tersebut."
        >
          <ThemeIcon variant="subtle" color="gray" size="sm" radius="xl" style={{ cursor: 'help' }}>
            <TbInfoCircle size={14} />
          </ThemeIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">
          sorted by open tasks
        </Text>
      </Group>
      <Stack gap={8}>
        {rows.map((r) => (
          <Group
            key={r.userId ?? 'none'}
            gap="sm"
            wrap="nowrap"
            onClick={r.userId && onSelectUser ? () => onSelectUser(r.userId as string) : undefined}
            style={r.userId && onSelectUser ? { cursor: 'pointer' } : undefined}
          >
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 160, flex: '0 0 160px' }}>
              <UserAvatar name={r.name} image={r.image} size={28} color="blue" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {r.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {r.role ?? '—'}
                </Text>
              </div>
            </Group>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Progress
                value={(r.open / maxOpen) * 100}
                color={r.overloaded ? 'red' : r.open > maxOpen * 0.6 ? 'orange' : 'teal'}
                size="md"
              />
            </div>
            <Text size="xs" fw={500} style={{ minWidth: 64, textAlign: 'right' }}>
              {r.open} open
            </Text>
            <Text size="xs" c="dimmed" style={{ minWidth: 70, textAlign: 'right' }}>
              {r.estimateHours}h est
            </Text>
            {r.overdue > 0 && (
              <Badge size="xs" color="red" variant="light">
                {r.overdue} overdue
              </Badge>
            )}
            {r.overloaded && (
              <Badge size="xs" color="red" variant="filled">
                overloaded
              </Badge>
            )}
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
