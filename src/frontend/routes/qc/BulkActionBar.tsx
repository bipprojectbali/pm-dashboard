import { Button, Group, Paper, Select, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

interface AdminUser { id: string; name: string; email: string; role: string; blocked: boolean }

type BulkPatch = { status?: string; priority?: string; assigneeId?: string | null }

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'READY_FOR_QC', label: 'Ready for QC' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'CLOSED', label: 'Closed' },
]
const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]
const UNASSIGN = '__unassign__'

export function BulkActionBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: sessionData } = useSession()
  const canAssign = sessionData?.user?.role === 'ADMIN' || sessionData?.user?.role === 'SUPER_ADMIN'

  const [status, setStatus] = useState<string | null>(null)
  const [priority, setPriority] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)

  const usersQ = useQuery({
    queryKey: ['users-assignable'],
    queryFn: () =>
      fetch('/api/users', { credentials: 'include' }).then((r) => r.json() as Promise<{ users: AdminUser[] }>),
    enabled: canAssign,
    staleTime: 60_000,
  })

  const bulkM = useMutation({
    mutationFn: async (patch: BulkPatch) => {
      const res = await fetch('/api/qc/tickets/bulk', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Bulk update gagal')
      return json as { updated: number }
    },
    onSuccess: (data) => {
      notifySuccess({ message: `${data.updated} ticket diupdate.` })
      setStatus(null)
      setPriority(null)
      setAssignee(null)
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      onDone()
    },
    onError: (err) => notifyError(err),
  })

  const buildPatch = (): BulkPatch => {
    const patch: BulkPatch = {}
    if (status) patch.status = status
    if (priority) patch.priority = priority
    if (assignee === UNASSIGN) patch.assigneeId = null
    else if (assignee) patch.assigneeId = assignee
    return patch
  }

  const patch = buildPatch()
  const nothingSelected = Object.keys(patch).length === 0

  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap="sm" wrap="wrap">
        <Text size="sm" fw={500}>{ids.length} ticket dipilih</Text>
        <Select
          placeholder="Status"
          value={status}
          onChange={setStatus}
          size="xs"
          w={150}
          clearable
          data={STATUS_OPTIONS}
        />
        <Select
          placeholder="Priority"
          value={priority}
          onChange={setPriority}
          size="xs"
          w={140}
          clearable
          data={PRIORITY_OPTIONS}
        />
        {canAssign && (
          <Select
            placeholder="Assignee"
            value={assignee}
            onChange={setAssignee}
            size="xs"
            w={180}
            clearable
            searchable
            disabled={usersQ.isLoading}
            data={[
              { value: UNASSIGN, label: '— Unassign —' },
              ...(usersQ.data?.users ?? [])
                .filter((u) => !u.blocked)
                .map((u) => ({ value: u.id, label: u.name || u.email })),
            ]}
          />
        )}
        <Button
          size="xs"
          disabled={nothingSelected || bulkM.isPending}
          loading={bulkM.isPending}
          onClick={() => bulkM.mutate(patch)}
        >
          Terapkan
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={onDone}>
          Batal
        </Button>
      </Group>
    </Paper>
  )
}
