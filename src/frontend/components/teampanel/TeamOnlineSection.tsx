import { Badge, Group, Paper, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { TbWifi } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { ROLE_COLOR, type Teammate } from './types'

type Props = {
  isLoading: boolean
  onlineTeammates: Teammate[]
}

export function TeamOnlineSection({ isLoading, onlineTeammates }: Props) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group gap="xs" mb="md" justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="green" size="md" radius="md">
            <TbWifi size={16} />
          </ThemeIcon>
          <div>
            <Title order={5}>Online Sekarang</Title>
            <Text size="xs" c="dimmed">
              Teman yang aktif dalam sesi sekarang.
            </Text>
          </div>
        </Group>
        <Badge color="green" variant="light">
          {onlineTeammates.length}
        </Badge>
      </Group>
      {isLoading ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Memuat…
        </Text>
      ) : onlineTeammates.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          Tidak ada teman yang online saat ini.
        </Text>
      ) : (
        <Group gap="md" wrap="wrap">
          {onlineTeammates.map((t) => (
            <Tooltip key={t.id} label={t.email} withArrow>
              <Group gap="xs" wrap="nowrap">
                <div style={{ position: 'relative' }}>
                  <UserAvatar name={t.name} image={t.image} size="md" color={ROLE_COLOR[t.role] ?? 'gray'} />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: 'var(--mantine-color-green-6)',
                      border: '2px solid var(--mantine-color-body)',
                    }}
                  />
                </div>
                <div>
                  <Text size="sm" fw={500}>
                    {t.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t.role}
                  </Text>
                </div>
              </Group>
            </Tooltip>
          ))}
        </Group>
      )}
    </Paper>
  )
}
