import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbEdit, TbPlus, TbTrash, TbX, TbCheck } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'

type PhaseStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED'

interface ProjectPhase {
  id: string
  projectId: string
  title: string
  description: string | null
  status: PhaseStatus
  order: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  _count: { tasks: number }
}

const PHASE_STATUS_COLOR: Record<PhaseStatus, string> = {
  PLANNING: 'gray',
  ACTIVE: 'blue',
  COMPLETED: 'green',
}

const STATUS_OPTIONS = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PhasesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [newStatus, setNewStatus] = useState<PhaseStatus>('PLANNING')
  const [newStartsAt, setNewStartsAt] = useState<Date | null>(null)
  const [newEndsAt, setNewEndsAt] = useState<Date | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<PhaseStatus>('PLANNING')
  const [editStartsAt, setEditStartsAt] = useState<Date | null>(null)
  const [editEndsAt, setEditEndsAt] = useState<Date | null>(null)

  const phasesQ = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<{ phases: ProjectPhase[] }>(`/api/projects/${projectId}/phases`),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['phases', projectId] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const create = useMutation({
    mutationFn: (body: { title: string; status: PhaseStatus; startsAt: string | null; endsAt: string | null }) =>
      api(`/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setTitle('')
      setNewStatus('PLANNING')
      setNewStartsAt(null)
      setNewEndsAt(null)
      notifySuccess({ message: 'Fase dibuat.' })
    },
    onError: (err) => notifyError(err),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/phases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setEditId(null)
      notifySuccess({ message: 'Fase diperbarui.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/phases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Fase dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const startEdit = (phase: ProjectPhase) => {
    setEditId(phase.id)
    setEditTitle(phase.title)
    setEditStatus(phase.status)
    setEditStartsAt(phase.startsAt ? new Date(phase.startsAt) : null)
    setEditEndsAt(phase.endsAt ? new Date(phase.endsAt) : null)
  }

  const cancelEdit = () => setEditId(null)

  const saveEdit = () => {
    if (!editId || !editTitle.trim()) return
    update.mutate({
      id: editId,
      body: {
        title: editTitle.trim(),
        status: editStatus,
        startsAt: editStartsAt ? editStartsAt.toISOString() : null,
        endsAt: editEndsAt ? editEndsAt.toISOString() : null,
      },
    })
  }

  const phases = phasesQ.data?.phases ?? []

  return (
    <Stack gap="md">
      {phasesQ.isLoading ? (
        <Text size="xs" c="dimmed">Loading…</Text>
      ) : phases.length === 0 ? (
        <Text size="xs" c="dimmed">Belum ada fase.</Text>
      ) : (
        <Stack gap={6}>
          {phases.map((phase) =>
            editId === phase.id ? (
              <Card key={phase.id} withBorder padding="sm" radius="md">
                <Stack gap="xs">
                  <Group gap="xs" wrap="nowrap">
                    <TextInput
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.currentTarget.value)}
                      size="xs"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <Select
                      data={STATUS_OPTIONS}
                      value={editStatus}
                      onChange={(v) => setEditStatus((v as PhaseStatus) ?? 'PLANNING')}
                      size="xs"
                      w={120}
                    />
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <DateInput
                      highlightToday
                      placeholder="Mulai"
                      value={editStartsAt}
                      onChange={(v) => setEditStartsAt(v ? new Date(v as unknown as string) : null)}
                      clearable
                      size="xs"
                      w={140}
                    />
                    <Text size="xs" c="dimmed">–</Text>
                    <DateInput
                      highlightToday
                      placeholder="Selesai"
                      value={editEndsAt}
                      onChange={(v) => setEditEndsAt(v ? new Date(v as unknown as string) : null)}
                      clearable
                      size="xs"
                      w={140}
                    />
                    <Group gap={4} ml="auto">
                      <Tooltip label="Simpan">
                        <ActionIcon
                          variant="filled"
                          color="blue"
                          size="sm"
                          onClick={saveEdit}
                          loading={update.isPending}
                          disabled={!editTitle.trim()}
                        >
                          <TbCheck size={13} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Batal">
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={cancelEdit}>
                          <TbX size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Stack>
              </Card>
            ) : (
              <Card key={phase.id} withBorder padding="sm" radius="md">
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    <Group gap={6} wrap="nowrap">
                      <Badge size="xs" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
                        {phase.status}
                      </Badge>
                      <Text size="sm" fw={500} truncate>
                        {phase.title}
                      </Text>
                    </Group>
                    <Group gap={6}>
                      {(phase.startsAt || phase.endsAt) && (
                        <Text size="xs" c="dimmed">
                          {formatDate(phase.startsAt) ?? '?'} – {formatDate(phase.endsAt) ?? '?'}
                        </Text>
                      )}
                      <Text size="xs" c="dimmed">
                        {phase._count.tasks} task
                      </Text>
                    </Group>
                  </Stack>
                  {canManage && (
                    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => startEdit(phase)}>
                          <TbEdit size={13} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Hapus">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Hapus fase "${phase.title}"? Task di fase ini akan kehilangan fase-nya.`))
                              remove.mutate(phase.id)
                          }}
                        >
                          <TbTrash size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>
              </Card>
            ),
          )}
        </Stack>
      )}

      {canManage && (
        <Card withBorder padding="sm" radius="md">
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">Tambah Fase</Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput
                placeholder="Nama fase"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim()) {
                    create.mutate({
                      title: title.trim(),
                      status: newStatus,
                      startsAt: newStartsAt ? newStartsAt.toISOString() : null,
                      endsAt: newEndsAt ? newEndsAt.toISOString() : null,
                    })
                  }
                }}
              />
              <Select
                data={STATUS_OPTIONS}
                value={newStatus}
                onChange={(v) => setNewStatus((v as PhaseStatus) ?? 'PLANNING')}
                size="xs"
                w={120}
              />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <DateInput
                highlightToday
                placeholder="Mulai (opsional)"
                value={newStartsAt}
                onChange={(v) => setNewStartsAt(v ? new Date(v as unknown as string) : null)}
                clearable
                size="xs"
                w={170}
              />
              <Text size="xs" c="dimmed">–</Text>
              <DateInput
                highlightToday
                placeholder="Selesai (opsional)"
                value={newEndsAt}
                onChange={(v) => setNewEndsAt(v ? new Date(v as unknown as string) : null)}
                clearable
                size="xs"
                w={170}
              />
              <Button
                leftSection={<TbPlus size={13} />}
                size="xs"
                disabled={!title.trim() || create.isPending}
                loading={create.isPending}
                onClick={() =>
                  create.mutate({
                    title: title.trim(),
                    status: newStatus,
                    startsAt: newStartsAt ? newStartsAt.toISOString() : null,
                    endsAt: newEndsAt ? newEndsAt.toISOString() : null,
                  })
                }
              >
                Tambah
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
