import { Button, Group, Pagination, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbStack2 } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'
import { PhaseAddForm } from './PhaseAddForm'
import { PhaseDetailModal } from './PhaseDetailModal'
import { EditPhaseModal } from './PhaseEditModal'
import { CompletePhaseModal, EditSummaryModal } from './PhaseSummaryModals'
import type { PhaseStatus, PhaseView, ProjectPhase, TagOption } from './phase.types'
import { PhasesGrid } from './phases/PhasesGrid'
import { PhasesToolbar } from './phases/PhasesToolbar'

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
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<PhaseView>({ key: 'pm:phases:view', defaultValue: 'stepper' })
  const [statusFilter, setStatusFilter] = useLocalStorage<PhaseStatus | 'ALL'>({
    key: 'pm:phases:statusFilter',
    defaultValue: 'ALL',
  })
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

  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)

  const allPhases = phasesQ.data?.phases ?? []

  // Hitung jumlah per status dari set yang sudah difilter-tag (bukan status),
  // supaya angka di badge status mencerminkan populasi yang relevan.
  const tagFilteredPhases = useMemo(
    () => (tagFilter ? allPhases.filter((p) => p.tags.some((t) => t.tagId === tagFilter)) : allPhases),
    [allPhases, tagFilter],
  )
  const statusCounts = useMemo(
    () => ({
      PLANNING: tagFilteredPhases.filter((p) => p.status === 'PLANNING').length,
      ACTIVE: tagFilteredPhases.filter((p) => p.status === 'ACTIVE').length,
      COMPLETED: tagFilteredPhases.filter((p) => p.status === 'COMPLETED').length,
    }),
    [tagFilteredPhases],
  )

  const phases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tagFilteredPhases.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (q && !p.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tagFilteredPhases, statusFilter, search])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [tagFilter, statusFilter, search])

  const totalPages = Math.ceil(phases.length / PAGE_SIZE)
  const pageOffset = (page - 1) * PAGE_SIZE
  const paginatedPhases = useMemo(() => phases.slice(pageOffset, pageOffset + PAGE_SIZE), [phases, pageOffset])

  // "Active step" hanya bermakna saat urutan penuh (tak difilter/dicari).
  // Saat difilter, urutan tak lengkap → jangan auto-highlight (active = -1).
  const isFiltered = statusFilter !== 'ALL' || search.trim() !== ''
  const stepperActive = useMemo(() => {
    if (isFiltered) return -1
    const idx = phases.findIndex((p) => p.status === 'ACTIVE')
    if (idx >= 0) return idx
    return phases.filter((p) => p.status === 'COMPLETED').length
  }, [phases, isFiltered])

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
        <EditSummaryModal phase={phase} onConfirm={(summary) => update.mutate({ id: phase.id, body: { summary } })} />
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
          body: JSON.stringify({
            title: t.title,
            description: t.description,
            status: 'PLANNING',
            startsAt: null,
            endsAt: null,
          }),
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
      {phasesQ.isLoading ? (
        <Text size="xs" c="dimmed">
          Loading…
        </Text>
      ) : allPhases.length === 0 ? (
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
        <>
          <PhasesToolbar
            search={search}
            onSearchChange={setSearch}
            view={view}
            onViewChange={setView}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusCounts={statusCounts}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            availableTags={availableTags}
          />
          <PhasesGrid
            view={view}
            phases={paginatedPhases}
            canManage={canManage}
            stepperActive={stepperActive - pageOffset}
            expandedSummaryIds={expandedSummaryIds}
            onToggleSummary={toggleSummary}
            onEditSummary={openEditSummaryModal}
            callbacks={{
              onView: openDetailModal,
              onStart: (phase) => update.mutate({ id: phase.id, body: { status: 'ACTIVE' } }),
              onComplete: openCompleteModal,
              onEdit: openEditModal,
              onDelete: openDeleteModal,
            }}
          />
        </>
      )}

      {totalPages > 1 && (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {pageOffset + 1}–{Math.min(pageOffset + PAGE_SIZE, phases.length)} dari {phases.length} fase
          </Text>
          <Pagination value={page} onChange={setPage} total={totalPages} size="xs" />
        </Group>
      )}

      {canManage && <PhaseAddForm projectId={projectId} availableTags={availableTags} onSuccess={invalidate} />}
    </Stack>
  )
}
