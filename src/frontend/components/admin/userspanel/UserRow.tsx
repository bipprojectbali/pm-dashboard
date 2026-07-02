import { ActionIcon, Badge, Group, Menu, Table, Text } from '@mantine/core'
import { TbBug, TbCircleFilled, TbDots, TbLock, TbLockOpen, TbShieldCheck, TbShieldOff } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import type { Role } from '@/frontend/hooks/useAuth'
import { type AdminUser, roleBadge } from './shared'

// One user row in the admin Users table. Action menu (role change / block)
// is only rendered when the current SUPER_ADMIN may act on the target.
export function UserRow({
  user,
  currentUserId,
  currentRole,
  isOnline,
  onChangeRole,
  onToggleBlock,
}: {
  user: AdminUser
  currentUserId: string | undefined
  currentRole: Role | undefined
  isOnline: boolean
  onChangeRole: (id: string, role: string) => void
  onToggleBlock: (id: string, blocked: boolean) => void
}) {
  const isSelf = user.id === currentUserId
  const badge = roleBadge[user.role] ?? roleBadge.USER
  const isTargetSuper = user.role === 'SUPER_ADMIN'
  const canActOnTarget = !isSelf && !isTargetSuper && currentRole === 'SUPER_ADMIN'

  return (
    <Table.Tr opacity={user.blocked ? 0.5 : 1}>
      <Table.Td>
        <Group gap="sm">
          <div style={{ position: 'relative' }}>
            <UserAvatar name={user.name} image={user.image} size="sm" color={badge.color} />
            {!user.blocked && (
              <TbCircleFilled
                size={10}
                color={isOnline ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-6)'}
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  borderRadius: '50%',
                  border: '2px solid var(--mantine-color-body)',
                }}
              />
            )}
          </div>
          <div>
            <Text size="sm" fw={500}>
              {user.name}{' '}
              {isSelf && (
                <Text span c="dimmed" size="xs">
                  (you)
                </Text>
              )}
            </Text>
            <Text size="xs" c="dimmed">
              {user.email}
            </Text>
          </div>
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge color={badge.color} variant="light" size="sm">
          {badge.label}
        </Badge>
      </Table.Td>
      <Table.Td>
        {user.blocked ? (
          <Badge color="red" variant="filled" size="sm">
            Blocked
          </Badge>
        ) : isOnline ? (
          <Badge color="green" variant="filled" size="sm">
            Online
          </Badge>
        ) : (
          <Badge color="gray" variant="light" size="sm">
            Offline
          </Badge>
        )}
      </Table.Td>
      <Table.Td ta="right">
        {canActOnTarget && (
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray">
                <TbDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Role</Menu.Label>
              {user.role !== 'USER' && (
                <Menu.Item leftSection={<TbShieldOff size={14} />} onClick={() => onChangeRole(user.id, 'USER')}>
                  Set as User
                </Menu.Item>
              )}
              {user.role !== 'QC' && (
                <Menu.Item leftSection={<TbBug size={14} />} onClick={() => onChangeRole(user.id, 'QC')}>
                  Set as QC
                </Menu.Item>
              )}
              {user.role !== 'ADMIN' && (
                <Menu.Item leftSection={<TbShieldCheck size={14} />} onClick={() => onChangeRole(user.id, 'ADMIN')}>
                  Set as Admin
                </Menu.Item>
              )}

              <Menu.Divider />
              <Menu.Label>Status</Menu.Label>
              {user.blocked ? (
                <Menu.Item
                  leftSection={<TbLockOpen size={14} />}
                  color="green"
                  onClick={() => onToggleBlock(user.id, false)}
                >
                  Unblock User
                </Menu.Item>
              ) : (
                <Menu.Item leftSection={<TbLock size={14} />} color="red" onClick={() => onToggleBlock(user.id, true)}>
                  Block User
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
