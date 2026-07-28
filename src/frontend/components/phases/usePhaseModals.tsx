// Modal orchestration for the phases section: opens detail/complete/edit/
// summary/delete modals and owns the expanded-summary toggle state.
import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import type { UseMutationResult } from '@tanstack/react-query'
import { useState } from 'react'
import { PhaseDetailModal } from '../PhaseDetailModal'
import { EditPhaseModal } from '../PhaseEditModal'
import { CompletePhaseModal, EditSummaryModal } from '../PhaseSummaryModals'
import type { ProjectPhase, TagOption } from '../phase.types'

interface Params {
  allPhases: ProjectPhase[]
  availableTags: TagOption[]
  update: UseMutationResult<unknown, Error, { id: string; body: Record<string, unknown> }, unknown>
  remove: UseMutationResult<unknown, Error, string, unknown>
}

export function usePhaseModals({ allPhases, availableTags, update, remove }: Params) {
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Set<string>>(new Set())

  const toggleSummary = (id: string) =>
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
          existingNames={allPhases.filter((p) => p.id !== phase.id).map((p) => p.title)}
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

  return {
    expandedSummaryIds,
    toggleSummary,
    openDetailModal,
    openCompleteModal,
    openEditModal,
    openEditSummaryModal,
    openDeleteModal,
  }
}
