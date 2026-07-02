import { Badge, Card, Group, Pagination, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbSearch } from 'react-icons/tb'
import { useSession } from '@/frontend/hooks/useAuth'
import { usePresence } from '@/frontend/hooks/usePresence'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import { type AdminUser, PAGE_SIZE, roleFilterOptions } from './userspanel/shared'
import { UserRow } from './userspanel/UserRow'

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
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                currentUserId={currentUserId}
                currentRole={currentRole}
                isOnline={onlineUserIds.includes(u.id)}
                onChangeRole={(id, role) => changeRole.mutate({ id, role })}
                onToggleBlock={(id, blocked) => toggleBlock.mutate({ id, blocked })}
              />
            ))}
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
