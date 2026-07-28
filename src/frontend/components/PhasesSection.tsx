import { Button, Group, Pagination, Stack, Text } from '@mantine/core'
import { TbStack2 } from 'react-icons/tb'
import { PhaseAddForm } from './PhaseAddForm'
import { PhasesGrid } from './phases/PhasesGrid'
import { PhasesToolbar } from './phases/PhasesToolbar'
import { usePhaseModals } from './phases/usePhaseModals'
import { usePhasesData } from './phases/usePhasesData'
import { usePhasesFilter } from './phases/usePhasesFilter'

export function PhasesSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { phasesQ, allPhases, availableTags, invalidate, update, remove, isTemplating, handleTemplate } =
    usePhasesData(projectId)

  const {
    tagFilter,
    setTagFilter,
    search,
    setSearch,
    view,
    setView,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    statusCounts,
    phases,
    paginatedPhases,
    totalPages,
    pageOffset,
    stepperActive,
    PAGE_SIZE,
  } = usePhasesFilter(allPhases)

  const {
    expandedSummaryIds,
    toggleSummary,
    openDetailModal,
    openCompleteModal,
    openEditModal,
    openEditSummaryModal,
    openDeleteModal,
  } = usePhaseModals({ allPhases, availableTags, update, remove })

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

      {canManage && (
        <PhaseAddForm
          projectId={projectId}
          availableTags={availableTags}
          existingNames={allPhases.map((p) => p.title)}
          onSuccess={invalidate}
        />
      )}
    </Stack>
  )
}
