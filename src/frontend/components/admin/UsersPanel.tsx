import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Menu,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbBug, TbCircleFilled, TbDots, TbLock, TbLockOpen, TbSearch, TbShieldCheck, TbShieldOff } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'
import { type Role, useSession } from '@/frontend/hooks/useAuth'
import { usePresence } from '@/frontend/hooks/usePresence'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

const PAGE_SIZE = 20

const roleFilterOptions = [
  { value: '', label: 'Semua role' },
  { value: 'USER', label: 'User' },
  { value: 'QC', label: 'QC' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
]

interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
  image?: string | null
}

const roleBadge: Record<string, { color: string; label: string }> = {
  USER: { color: 'blue', label: 'User' },
  QC: { color: 'teal', label: 'QC' },
  ADMIN: { color: 'violet', label: 'Admin' },
  SUPER_ADMIN: { color: 'red', label: 'Super Admin' },
}

export function UsersPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(1)

  // Reset to first page whenever the filters change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setPage is stable; deps are the filter triggers
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, roleFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, roleFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (roleFilter) params.set('role', roleFilter)
      return fetch(`/api/admin/users?${params}`, { credentials: 'include' }).then((r) => r.json()) as Promise<{
        users: AdminUser[]
        total: number
        limit: number
        offset: number
      }>
    },
  })

  const { data: sessionData } = useSession()
  const currentUserId = sessionData?.user?.id
  const currentRole = sessionData?.user?.role
  const { onlineUserIds } = usePresence()

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mengubah role')
      return json
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      notifySuccess({ message: `Role diubah ke ${vars.role}.` })
    },
    onError: (err) => notifyError(err),
  })

  const toggleBlock = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      const res = await fetch(`/api/admin/users/${id}/block`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memperbarui status')
      return json
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      notifySuccess({ message: vars.blocked ? 'User diblokir.' : 'User diaktifkan kembali.' })
    },
    onError: (err) => notifyError(err),
  })

  const users = data?.users ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={3}>User Management</Title>
        <Badge variant="light" size="lg">
          {total} users
        </Badge>
      </Group>

      <Group gap="sm" wrap="wrap">
        <TextInput
          placeholder="Cari nama atau email…"
          leftSection={<TbSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
        />
        <Select
          data={roleFilterOptions}
          value={roleFilter}
          onChange={(v) => setRoleFilter(v ?? '')}
          w={{ base: '100%', sm: 180 }}
          allowDeselect={false}
        />
      </Group>

      <Card withBorder radius="md" p={0}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="md">
                    Loading...
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {!isLoading && users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="md">
                    {debouncedSearch || roleFilter ? 'Tidak ada user yang cocok.' : 'Belum ada user.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              const badge = roleBadge[u.role] ?? roleBadge.USER
              const isOnline = onlineUserIds.includes(u.id)
              const isTargetSuper = u.role === 'SUPER_ADMIN'
              const canActOnTarget = !isSelf && !isTargetSuper && currentRole === 'SUPER_ADMIN'

              return (
                <Table.Tr key={u.id} opacity={u.blocked ? 0.5 : 1}>
                  <Table.Td>
                    <Group gap="sm">
                      <div style={{ position: 'relative' }}>
                        <UserAvatar name={u.name} image={u.image} size="sm" color={badge.color} />
                        {!u.blocked && (
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
                          {u.name}{' '}
                          {isSelf && (
                            <Text span c="dimmed" size="xs">
                              (you)
                            </Text>
                          )}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {u.email}
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
                    {u.blocked ? (
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
                          {u.role !== 'USER' && (
                            <Menu.Item
                              leftSection={<TbShieldOff size={14} />}
                              onClick={() => changeRole.mutate({ id: u.id, role: 'USER' })}
                            >
                              Set as User
                            </Menu.Item>
                          )}
                          {u.role !== 'QC' && (
                            <Menu.Item
                              leftSection={<TbBug size={14} />}
                              onClick={() => changeRole.mutate({ id: u.id, role: 'QC' })}
                            >
                              Set as QC
                            </Menu.Item>
                          )}
                          {u.role !== 'ADMIN' && (
                            <Menu.Item
                              leftSection={<TbShieldCheck size={14} />}
                              onClick={() => changeRole.mutate({ id: u.id, role: 'ADMIN' })}
                            >
                              Set as Admin
                            </Menu.Item>
                          )}

                          <Menu.Divider />
                          <Menu.Label>Status</Menu.Label>
                          {u.blocked ? (
                            <Menu.Item
                              leftSection={<TbLockOpen size={14} />}
                              color="green"
                              onClick={() => toggleBlock.mutate({ id: u.id, blocked: false })}
                            >
                              Unblock User
                            </Menu.Item>
                          ) : (
                            <Menu.Item
                              leftSection={<TbLock size={14} />}
                              color="red"
                              onClick={() => toggleBlock.mutate({ id: u.id, blocked: true })}
                            >
                              Block User
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Card>

      {total > PAGE_SIZE && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </Text>
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  )
}
