import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbEdit, TbPlayerPlay, TbPlus, TbStack2, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'

type PhaseStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED'

interface ProjectPhase {
  id: string
  projectId: string
  title: string
  description: string | null
  summary: string | null
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

const TEMPLATE_PHASES = [
  { title: 'Planning', description: 'Perencanaan scope, requirements, dan timeline' },
  { title: 'Development', description: 'Implementasi fitur utama' },
  { title: 'Testing', description: 'QA, bug fixing, dan validasi' },
  { title: 'Release', description: 'Deployment, monitoring, dan handover' },
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

function CompletePhaseModal({ phaseName, onConfirm }: { phaseName: string; onConfirm: (summary: string) => void }) {
  const [summary, setSummary] = useState('')
  return (
    <Stack gap="sm">
      <Text size="sm">
        Fase <b>"{phaseName}"</b> akan ditandai selesai.
      </Text>
      <Textarea
        label="Kesimpulan (opsional)"
        placeholder="Apa yang dicapai, pelajaran yang dipetik…"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        autosize
        minRows={3}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button
          color="green"
          size="xs"
          onClick={() => {
            onConfirm(summary)
            modals.closeAll()
          }}
        >
          Tandai Selesai
        </Button>
      </Group>
    </Stack>
  )
}

function EditPhaseModal({
  phase,
  onSubmit,
}: {
  phase: ProjectPhase
  onSubmit: (data: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(phase.title)
  const [description, setDescription] = useState(phase.description ?? '')
  const [status, setStatus] = useState<PhaseStatus>(phase.status)
  const [startsAt, setStartsAt] = useState<Date | null>(phase.startsAt ? new Date(phase.startsAt) : null)
  const [endsAt, setEndsAt] = useState<Date | null>(phase.endsAt ? new Date(phase.endsAt) : null)

  const submit = () => {
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      status,
      startsAt: startsAt ? startsAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
    })
    modals.closeAll()
  }

  return (
    <Stack gap="sm">
      <TextInput
        label="Nama fase"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        required
        data-autofocus
      />
      <Textarea
        label="Deskripsi (opsional)"
        placeholder="Tujuan atau scope fase ini"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      <Select
        label="Status"
        data={STATUS_OPTIONS}
        value={status}
        onChange={(v) => setStatus((v as PhaseStatus) ?? 'PLANNING')}
      />
      <Group grow>
        <DateInput
          highlightToday
          label="Mulai"
          placeholder="Opsional"
          value={startsAt}
          onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
          clearable
        />
        <DateInput
          highlightToday
          label="Selesai"
          placeholder="Opsional"
          value={endsAt}
          onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
          clearable
        />
      </Group>
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="xs" onClick={() => modals.closeAll()}>
          Batal
        </Button>
        <Button size="xs" onClick={submit} disabled={!title.trim()}>
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}

export function PhasesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [newStartsAt, setNewStartsAt] = useState<Date | null>(null)
  const [newEndsAt, setNewEndsAt] = useState<Date | null>(null)

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
    mutationFn: (body: {
      title: string
      description?: string | null
      status?: string
      startsAt: string | null
      endsAt: string | null
    }) =>
      api(`/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setTitle('')
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

  const phases = phasesQ.data?.phases ?? []

  const stepperActive = useMemo(() => {
    const idx = phases.findIndex((p) => p.status === 'ACTIVE')
    if (idx >= 0) return idx
    return phases.filter((p) => p.status === 'COMPLETED').length
  }, [phases])

  const openCompleteModal = (phase: ProjectPhase) => {
    modals.open({
      title: 'Selesaikan Fase',
      children: (
        <CompletePhaseModal
          phaseName={phase.title}
          onConfirm={(summary) => update.mutate({ id: phase.id, body: { status: 'COMPLETED', summary } })}
        />
      ),
    })
  }

  const openEditModal = (phase: ProjectPhase) => {
    modals.open({
      title: 'Edit Fase',
      children: <EditPhaseModal phase={phase} onSubmit={(data) => update.mutate({ id: phase.id, body: data })} />,
    })
  }

  const handleTemplate = async () => {
    for (const t of TEMPLATE_PHASES) {
      await create.mutateAsync({ title: t.title, description: t.description, status: 'PLANNING', startsAt: null, endsAt: null })
    }
    invalidate()
  }

  return (
    <Stack gap="md">
      {phasesQ.isLoading ? (
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      ) : phases.length === 0 ? (
        <Stack align="center" py="xl" gap="sm">
          <Text c="dimmed" size="sm">
            Belum ada fase.
          </Text>
          {canManage && (
            <Button
              variant="light"
              size="xs"
              leftSection={<TbStack2 size={14} />}
              onClick={handleTemplate}
              loading={create.isPending}
            >
              Gunakan Template Standar
            </Button>
          )}
        </Stack>
      ) : (
        <Stepper active={stepperActive} orientation="vertical" size="sm">
          {phases.map((phase) => (
            <Stepper.Step
              key={phase.id}
              label={
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500}>
                    {phase.title}
                  </Text>
                  <Badge size="xs" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
                    {phase.status}
                  </Badge>
                  <Badge size="xs" variant="default" color="gray">
                    {phase._count.tasks} task
                  </Badge>
                </Group>
              }
              description={
                phase.startsAt || phase.endsAt ? (
                  <Text size="xs" c="dimmed">
                    {formatDate(phase.startsAt) ?? '?'} – {formatDate(phase.endsAt) ?? '?'}
                  </Text>
                ) : undefined
              }
              color={phase.status === 'COMPLETED' ? 'green' : phase.status === 'ACTIVE' ? 'blue' : 'gray'}
            >
              <Stack pb="sm" gap="xs">
                {phase.description && (
                  <Text size="xs" c="dimmed" fs="italic">
                    {phase.description}
                  </Text>
                )}
                {phase.status === 'COMPLETED' && (
                  <Card withBorder radius="sm" p="xs" bg="green.0">
                    <Text size="xs" fw={600} mb={2}>
                      Kesimpulan
                    </Text>
                    <Text size="xs" c={phase.summary ? undefined : 'dimmed'}>
                      {phase.summary || '—'}
                    </Text>
                  </Card>
                )}
                {canManage && (
                  <Group gap={4}>
                    {phase.status === 'PLANNING' && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="blue"
                        leftSection={<TbPlayerPlay size={11} />}
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: phase.id, body: { status: 'ACTIVE' } })}
                      >
                        Mulai Fase
                      </Button>
                    )}
                    {phase.status === 'ACTIVE' && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="green"
                        onClick={() => openCompleteModal(phase)}
                      >
                        Selesaikan Fase
                      </Button>
                    )}
                    <Tooltip label="Edit fase">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEditModal(phase)}>
                        <TbEdit size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Hapus fase">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        loading={remove.isPending}
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
              </Stack>
            </Stepper.Step>
          ))}
        </Stepper>
      )}

      {canManage && (
        <Card withBorder padding="sm" radius="md">
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">
              Tambah Fase
            </Text>
            <TextInput
              placeholder="Nama fase"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              size="xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim()) {
                  create.mutate({
                    title: title.trim(),
                    status: 'PLANNING',
                    startsAt: newStartsAt ? newStartsAt.toISOString() : null,
                    endsAt: newEndsAt ? newEndsAt.toISOString() : null,
                  })
                }
              }}
            />
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
              <Text size="xs" c="dimmed">
                –
              </Text>
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
                    status: 'PLANNING',
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
