import { ActionIcon, Avatar, Group, Popover, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { TbLayoutList, TbUsers } from 'react-icons/tb'
import { UserAvatar } from '../shared/UserAvatar'

const MAX_AVATAR_VISIBLE = 14
const AVATAR_SIZE = 36

export function UserFilterStrip({
  users,
  value,
  onChange,
  onSwitchMode,
}: {
  users: Array<{ id: string; name: string; image?: string | null }>
  value: string | null
  onChange: (id: string | null) => void
  onSwitchMode: () => void
}) {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const visible = users.slice(0, MAX_AVATAR_VISIBLE)
  const overflowUsers = users.slice(MAX_AVATAR_VISIBLE)
  const activeUser = value ? users.find((u) => u.id === value) : null

  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="md">
      <Group gap={6} align="center" style={{ flexShrink: 0, minWidth: 80 }}>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
          Anggota
        </Text>
        {activeUser && (
          <Text size="xs" c="blue" fw={500} truncate style={{ maxWidth: 100 }}>
            · {activeUser.name.split(' ')[0]}
          </Text>
        )}
      </Group>

      <Group gap={14} wrap="wrap" style={{ flex: 1 }}>
        <Tooltip label="Semua anggota" withArrow>
          <UnstyledButton onClick={() => onChange(null)}>
            <Avatar
              size={AVATAR_SIZE}
              radius="xl"
              variant={!value ? 'filled' : 'default'}
              color="blue"
              style={{
                outline: !value ? '2px solid var(--mantine-color-blue-5)' : 'none',
                outlineOffset: 2,
                cursor: 'pointer',
                transition: 'transform 0.1s, opacity 0.1s',
                transform: !value ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              <TbUsers size={16} />
            </Avatar>
          </UnstyledButton>
        </Tooltip>

        {visible.map((u) => {
          const isActive = value === u.id
          const isDimmed = !!value && !isActive
          return (
            <Tooltip key={u.id} label={u.name} withArrow>
              <UnstyledButton
                onClick={() => onChange(isActive ? null : u.id)}
                style={{ transition: 'transform 0.1s', transform: isActive ? 'scale(1.12)' : 'scale(1)' }}
              >
                <UserAvatar
                  image={u.image}
                  name={u.name}
                  size={AVATAR_SIZE}
                  color="blue"
                  style={{
                    outline: isActive
                      ? '2px solid var(--mantine-color-blue-5)'
                      : '2px solid var(--mantine-color-cyan-5)',
                    outlineOffset: 2,
                    opacity: isDimmed ? 0.32 : 1,
                    cursor: 'pointer',
                    transition: 'opacity 0.1s, outline 0.1s',
                  }}
                />
              </UnstyledButton>
            </Tooltip>
          )
        })}

        {overflowUsers.length > 0 && (
          <Popover opened={overflowOpen} onChange={setOverflowOpen} withArrow shadow="md" position="bottom-start">
            <Popover.Target>
              <Tooltip label={`+${overflowUsers.length} anggota lainnya`} withArrow disabled={overflowOpen}>
                <UnstyledButton onClick={() => setOverflowOpen((o) => !o)}>
                  <Avatar
                    size={AVATAR_SIZE}
                    radius="xl"
                    color="gray"
                    variant="light"
                    style={{ cursor: 'pointer', fontWeight: 700 }}
                  >
                    +{overflowUsers.length}
                  </Avatar>
                </UnstyledButton>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
              <Stack gap={8}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  Anggota lainnya
                </Text>
                <Group gap={8} wrap="wrap" style={{ maxWidth: 280 }}>
                  {overflowUsers.map((u) => {
                    const isActive = value === u.id
                    return (
                      <Tooltip key={u.id} label={u.name} withArrow>
                        <UnstyledButton
                          onClick={() => {
                            onChange(isActive ? null : u.id)
                            setOverflowOpen(false)
                          }}
                          style={{ transform: isActive ? 'scale(1.12)' : 'scale(1)', transition: 'transform 0.1s' }}
                        >
                          <UserAvatar
                            image={u.image}
                            name={u.name}
                            size={AVATAR_SIZE}
                            color="blue"
                            style={{
                              outline: isActive
                                ? '2px solid var(--mantine-color-blue-5)'
                                : '2px solid var(--mantine-color-default-border)',
                              outlineOffset: 2,
                              opacity: value && !isActive ? 0.35 : 1,
                              cursor: 'pointer',
                              transition: 'opacity 0.1s',
                            }}
                          />
                        </UnstyledButton>
                      </Tooltip>
                    )
                  })}
                </Group>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>

      <Tooltip label="Ganti ke dropdown" withArrow>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onSwitchMode} style={{ flexShrink: 0 }}>
          <TbLayoutList size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
