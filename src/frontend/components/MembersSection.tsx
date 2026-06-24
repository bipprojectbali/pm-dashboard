import { ActionIcon, Badge, Button, Group, MultiSelect, Select, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbPlus, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import type { MemberRole, ProjectDetail } from './ProjectsPanel'
import { UserAvatar } from './shared/UserAvatar'

interface UserOption {
  id: string
  name: string
  email: string
  role: string
}

const ROLE_COLOR: Record<MemberRole, string> = {
  OWNER: 'red',
  PM: 'violet',
  MEMBER: 'blue',
  VIEWER: 'gray',
}

const SELECT_ALL_VALUE = '__select_all__'

const MEMBER_ROLE_OPTIONS: Array<{ value: MemberRole; label: string }> = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'PM', label: 'PM' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function MembersSection({
  projectId,
  myRole,
  systemRole,
  ownerId,
}: {
  projectId: string
  myRole: MemberRole | null
  systemRole?: string | null
  ownerId: string
}) {
  const qc = useQueryClient()
  const [addUserIds, setAddUserIds] = useState<string[]>([])
  const [addRole, setAddRole] = useState<MemberRole>('MEMBER')
  const [isAdding, setIsAdding] = useState(false)

  const detailQ = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ project: ProjectDetail; myRole: MemberRole | null }>(`/api/projects/${projectId}`),
  })
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: UserOption[] }>('/api/users'),
  })

  const handleAdd = async () => {
    if (addUserIds.length === 0 || isAdding) return
    setIsAdding(true)
    try {
      await Promise.all(
        addUserIds.map((userId) =>
          api(`/api/projects/${projectId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role: addRole }),
          }),
        ),
      )
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setAddUserIds([])
      notifySuccess({
        message: addUserIds.length === 1 ? 'Member ditambahkan.' : `${addUserIds.length} member ditambahkan.`,
      })
    } catch (err) {
      notifyError(err instanceof Error ? err : new Error('Gagal menambahkan member'))
    } finally {
      setIsAdding(false)
    }
  }

  const handleMultiChange = (values: string[]) => {
    if (values.includes(SELECT_ALL_VALUE)) {
      const allIds = userOptions.map((u) => u.value)
      // toggle: jika semua sudah terpilih → kosongkan; jika belum → pilih semua
      setAddUserIds(addUserIds.length === allIds.length ? [] : allIds)
    } else {
      setAddUserIds(values)
    }
  }

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      api(`/api/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({ message: `Role member diubah ke ${vars.role}.` })
    },
    onError: (err) => notifyError(err),
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => api(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({ message: 'Member dikeluarkan.' })
    },
    onError: (err) => notifyError(err),
  })

  const isSysAdmin = systemRole === 'ADMIN' || systemRole === 'SUPER_ADMIN'
  const canManage = isSysAdmin || myRole === 'OWNER' || myRole === 'PM'
  const canRemove = canManage
  const canGrantOwner = systemRole === 'SUPER_ADMIN' || myRole === 'OWNER'

  const members = detailQ.data?.project.members ?? []
  const memberUserIds = new Set(members.map((m) => m.userId))
  const userOptions = useMemo(
    () =>
      (usersQ.data?.users ?? [])
        .filter((u) => !memberUserIds.has(u.id))
        .map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` })),
    [usersQ.data, memberUserIds],
  )
  const roleOptions = canGrantOwner ? MEMBER_ROLE_OPTIONS : MEMBER_ROLE_OPTIONS.filter((r) => r.value !== 'OWNER')
  const allSelected = userOptions.length > 0 && addUserIds.length === userOptions.length
  const multiSelectData = userOptions.length > 0
    ? [{ value: SELECT_ALL_VALUE, label: allSelected ? '✓ Batalkan Pilih Semua' : '✓ Pilih Semua' }, ...userOptions]
    : []

  return (
    <Stack gap="xs">
      {detailQ.isLoading ? (
        <Text size="xs" c="dimmed">
          Loading members…
        </Text>
      ) : (
        <Stack gap={6}>
          {members.map((m) => {
            const isOwner = m.userId === ownerId
            return (
              <Group key={m.id} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <UserAvatar
                    name={m.user.name}
                    image={m.user.image}
                    size={28}
                    color="blue"
                    style={{ flexShrink: 0 }}
                  />
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {m.user.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {m.user.email}
                    </Text>
                  </Stack>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {canManage && !isOwner ? (
                    <Select
                      size="xs"
                      data={roleOptions}
                      value={m.role}
                      onChange={(v) => v && changeRole.mutate({ userId: m.userId, role: v as MemberRole })}
                      w={110}
                      allowDeselect={false}
                    />
                  ) : (
                    <Badge color={ROLE_COLOR[m.role]} variant="light" size="sm">
                      {m.role}
                    </Badge>
                  )}
                  {canRemove && !isOwner && (
                    <Tooltip label="Remove member">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Remove ${m.user.name} from this project?`)) {
                            removeMember.mutate(m.userId)
                          }
                        }}
                      >
                        <TbTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            )
          })}
        </Stack>
      )}

      {canManage && (
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <MultiSelect
            label="Add member"
            placeholder={userOptions.length === 0 ? 'All users added' : 'Pilih user…'}
            data={multiSelectData}
            value={addUserIds}
            onChange={handleMultiChange}
            searchable
            disabled={userOptions.length === 0 || isAdding}
            style={{ flex: 1 }}
            maxDropdownHeight={260}
            hidePickedOptions={false}
          />
          <Select
            label="Role"
            data={roleOptions}
            value={addRole}
            onChange={(v) => v && setAddRole(v as MemberRole)}
            w={110}
            allowDeselect={false}
          />
          <Tooltip
            label={addUserIds.length > 1 ? `Tambah ${addUserIds.length} member` : 'Tambah member'}
            withArrow
            disabled={addUserIds.length === 0}
          >
            <Button
              leftSection={<TbPlus size={14} />}
              disabled={addUserIds.length === 0 || isAdding}
              loading={isAdding}
              onClick={handleAdd}
            >
              Add{addUserIds.length > 1 ? ` (${addUserIds.length})` : ''}
            </Button>
          </Tooltip>
        </Group>
      )}

      {(changeRole.error || removeMember.error) && (
        <Text size="xs" c="red">
          {(changeRole.error as Error | null)?.message ?? (removeMember.error as Error | null)?.message}
        </Text>
      )}
    </Stack>
  )
}
