import { Badge, Button, Card, Group, Stack, Stepper, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbPlus, TbStack2 } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import {
  CompletePhaseModal,
  EditPhaseModal,
  formatPhaseDate,
  PHASE_STATUS_COLOR,
  PhaseActionsMenu,
  PhaseDetailModal,
  type ProjectPhase,
} from './PhaseModals'

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

  const openDetailModal = (phase: ProjectPhase) => {
    modals.open({ title: phase.title, children: <PhaseDetailModal phase={phase} /> })
  }

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

  const openDeleteModal = (phase: ProjectPhase) => {
    modals.openConfirmModal({
      title: 'Hapus Fase',
      children: (
        <Text size="sm">
          Hapus fase <b>"{phase.title}"</b>?
          {phase._count.tasks > 0
            ? ` ${phase._count.tasks} task di fase ini akan kehilangan fase-nya (tidak terhapus).`
            : ' Tindakan ini tidak bisa dibatalkan.'}
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(phase.id),
    })
  }

  const handleTemplate = async () => {
    for (const t of TEMPLATE_PHASES) {
      await create.mutateAsync({
        title: t.title,
        description: t.description,
        status: 'PLANNING',
        startsAt: null,
        endsAt: null,
      })
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
                  <Text size="sm" fw={500} style={{ cursor: 'pointer' }} onClick={() => openDetailModal(phase)}>
                    {phase.title}
                  </Text>
                  <Badge size="xs" color={PHASE_STATUS_COLOR[phase.status]} variant="light">
                    {phase.status}
                  </Badge>
                  <Badge size="xs" variant="default" color="gray">
                    {phase._count.tasks} task
                  </Badge>
                  {canManage ? (
                    <PhaseActionsMenu
                      phase={phase}
                      onView={() => openDetailModal(phase)}
                      onStart={() => update.mutate({ id: phase.id, body: { status: 'ACTIVE' } })}
                      onComplete={() => openCompleteModal(phase)}
                      onEdit={() => openEditModal(phase)}
                      onDelete={() => openDeleteModal(phase)}
                    />
                  ) : (
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={() => openDetailModal(phase)}>
                      Detail
                    </Button>
                  )}
                </Group>
              }
              description={
                phase.startsAt || phase.endsAt ? (
                  <Text size="xs" c="dimmed">
                    {formatPhaseDate(phase.startsAt) ?? '?'} – {formatPhaseDate(phase.endsAt) ?? '?'}
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
                  <Card withBorder radius="sm" p="xs" bg="var(--mantine-color-green-light)">
                    <Text size="xs" fw={600} mb={2} c="var(--mantine-color-green-light-color)">
                      Kesimpulan
                    </Text>
                    <Text size="xs" c={phase.summary ? undefined : 'dimmed'}>
                      {phase.summary || '—'}
                    </Text>
                  </Card>
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
