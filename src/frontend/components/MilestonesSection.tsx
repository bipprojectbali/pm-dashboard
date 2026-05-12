import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbPlus, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'

interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description: string | null
  dueAt: string | null
  completedAt: string | null
  order: number
  createdAt: string
  updatedAt: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MilestonesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState<Date | null>(null)

  const milestonesQ = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => api<{ milestones: ProjectMilestone[] }>(`/api/projects/${projectId}/milestones`),
  })

  const create = useMutation({
    mutationFn: (body: { title: string; dueAt: string | null }) =>
      api(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] })
      qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setTitle('')
      setDueAt(null)
      notifySuccess({ message: 'Milestone dibuat.' })
    },
    onError: (err) => notifyError(err),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] })
      qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({ message: 'Milestone diperbarui.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/milestones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] })
      qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      notifySuccess({ message: 'Milestone dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const milestones = milestonesQ.data?.milestones ?? []
  const now = Date.now()

  return (
    <Stack gap="xs">
      {milestonesQ.isLoading ? (
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      ) : milestones.length === 0 ? (
        <Text size="xs" c="dimmed">
          No milestones yet.
        </Text>
      ) : (
        <Stack gap={6}>
          {milestones.map((m) => {
            const done = !!m.completedAt
            const overdue = !done && m.dueAt && new Date(m.dueAt).getTime() < now
            return (
              <Group key={m.id} justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Checkbox
                    checked={done}
                    disabled={!canManage || update.isPending}
                    onChange={(e) => update.mutate({ id: m.id, body: { completed: e.currentTarget.checked } })}
                  />
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text
                      size="sm"
                      fw={500}
                      truncate
                      td={done ? 'line-through' : undefined}
                      c={done ? 'dimmed' : undefined}
                    >
                      {m.title}
                    </Text>
                    <Group gap={4}>
                      {m.dueAt && (
                        <Text size="xs" c={overdue ? 'red' : 'dimmed'}>
                          Due {formatDate(m.dueAt)}
                        </Text>
                      )}
                      {overdue && (
                        <Badge size="xs" color="red" variant="light">
                          Overdue
                        </Badge>
                      )}
                      {done && (
                        <Text size="xs" c="dimmed">
                          · Done {formatDate(m.completedAt)}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                </Group>
                {canManage && (
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete milestone "${m.title}"?`)) remove.mutate(m.id)
                      }}
                    >
                      <TbTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            )
          })}
        </Stack>
      )}

      {canManage && (
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            label="Add milestone"
            placeholder="e.g. MVP launch"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <DateInput
            label="Due"
            value={dueAt}
            onChange={(v) => setDueAt(v ? new Date(v as unknown as string) : null)}
            clearable
            w={160}
          />
          <Button
            leftSection={<TbPlus size={14} />}
            disabled={!title.trim() || create.isPending}
            loading={create.isPending}
            onClick={() => create.mutate({ title: title.trim(), dueAt: dueAt ? dueAt.toISOString() : null })}
          >
            Add
          </Button>
        </Group>
      )}

      {(create.error || update.error || remove.error) && (
        <Text size="xs" c="red">
          {(create.error as Error | null)?.message ??
            (update.error as Error | null)?.message ??
            (remove.error as Error | null)?.message}
        </Text>
      )}
    </Stack>
  )
}
