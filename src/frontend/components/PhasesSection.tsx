import { ActionIcon, Badge, Button, Card, Collapse, Group, Select, Stack, Stepper, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbChevronDown, TbChevronRight, TbEdit, TbStack2, TbTag } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import {
  CompletePhaseModal,
  EditPhaseModal,
  EditSummaryModal,
  formatPhaseDate,
  PHASE_STATUS_COLOR,
  PhaseActionsMenu,
  PhaseDetailModal,
  type ProjectPhase,
  type TagOption,
} from './PhaseModals'
import { PhaseAddForm } from './PhaseAddForm'

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
  const [isTemplating, setIsTemplating] = useState(false)
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Set<string>>(new Set())
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const toggleSummary = (id: string) =>
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const phasesQ = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<{ phases: ProjectPhase[] }>(`/api/projects/${projectId}/phases`),
  })

  const tagsQ = useQuery({
    queryKey: ['tags', projectId],
    queryFn: () => api<{ tags: TagOption[] }>(`/api/projects/${projectId}/tags`),
  })
  const availableTags = tagsQ.data?.tags ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['phases', projectId] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

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

  const allPhases = phasesQ.data?.phases ?? []
  const phases = useMemo(
    () => (tagFilter ? allPhases.filter((p) => p.tags.some((t) => t.tagId === tagFilter)) : allPhases),
    [allPhases, tagFilter],
  )

  const stepperActive = useMemo(() => {
    const idx = phases.findIndex((p) => p.status === 'ACTIVE')
    if (idx >= 0) return idx
    return phases.filter((p) => p.status === 'COMPLETED').length
  }, [phases])

  const openDetailModal = (phase: ProjectPhase) => {
    modals.open({ title: phase.title, size: 'lg', children: <PhaseDetailModal phase={phase} /> })
  }

  const openCompleteModal = (phase: ProjectPhase) => {
    modals.open({
      title: 'Selesaikan Fase',
      size: 'lg',
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
      children: (
        <EditPhaseModal
          phase={phase}
          availableTags={availableTags}
          onSubmit={(data) => update.mutate({ id: phase.id, body: data })}
        />
      ),
    })
  }

  const openEditSummaryModal = (phase: ProjectPhase) => {
    modals.open({
      title: `Kesimpulan — ${phase.title}`,
      size: 'lg',
      children: (
        <EditSummaryModal
          phase={phase}
          onConfirm={(summary) => update.mutate({ id: phase.id, body: { summary } })}
        />
      ),
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
    setIsTemplating(true)
    try {
      for (const t of TEMPLATE_PHASES) {
        const res = await fetch(`/api/projects/${projectId}/phases`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t.title, description: t.description, status: 'PLANNING', startsAt: null, endsAt: null }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }
      invalidate()
      notifySuccess({ message: 'Template fase dibuat.' })
    } catch (err) {
      notifyError(err instanceof Error ? err : new Error('Gagal membuat template'))
    } finally {
      setIsTemplating(false)
    }
  }

  return (
    <Stack gap="md">
      {availableTags.length > 0 && (
        <Select
          size="xs"
          placeholder="Filter by tag"
          leftSection={<TbTag size={13} />}
          data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
          value={tagFilter}
          onChange={setTagFilter}
          clearable
          w={200}
        />
      )}
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
              loading={isTemplating}
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
                  {phase.tags.map(({ tag }) => (
                    <Badge key={tag.id} size="xs" color={tag.color} variant="light">
                      {tag.name}
                    </Badge>
                  ))}
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
                <Stack gap={4} mt={2}>
                  {(phase.startsAt || phase.endsAt) && (
                    <Text size="xs" c="dimmed">
                      {formatPhaseDate(phase.startsAt) ?? '?'} – {formatPhaseDate(phase.endsAt) ?? '?'}
                    </Text>
                  )}
                  {phase.status === 'COMPLETED' && (
                    <Card withBorder radius="sm" p="xs" bg="var(--mantine-color-green-light)">
                      <Group
                        justify="space-between"
                        gap={4}
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleSummary(phase.id)}
                      >
                        <Group gap={4}>
                          {expandedSummaryIds.has(phase.id)
                            ? <TbChevronDown size={12} color="var(--mantine-color-green-light-color)" />
                            : <TbChevronRight size={12} color="var(--mantine-color-green-light-color)" />}
                          <Text size="xs" fw={600} c="var(--mantine-color-green-light-color)">
                            Kesimpulan
                          </Text>
                        </Group>
                        {canManage && expandedSummaryIds.has(phase.id) && (
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="green"
                            onClick={(e) => { e.stopPropagation(); openEditSummaryModal(phase) }}
                          >
                            <TbEdit size={12} />
                          </ActionIcon>
                        )}
                      </Group>
                      <Collapse in={expandedSummaryIds.has(phase.id)}>
                        <Text size="xs" c={phase.summary ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }} mt={6}>
                          {phase.summary || '—'}
                        </Text>
                      </Collapse>
                    </Card>
                  )}
                </Stack>
              }
              color={phase.status === 'COMPLETED' ? 'green' : phase.status === 'ACTIVE' ? 'blue' : 'gray'}
            >
              {phase.description && (
                <Text size="xs" c="dimmed" fs="italic" pb="sm">
                  {phase.description}
                </Text>
              )}
            </Stepper.Step>
          ))}
        </Stepper>
      )}

      {canManage && <PhaseAddForm projectId={projectId} availableTags={availableTags} onSuccess={invalidate} />}
    </Stack>
  )
}
