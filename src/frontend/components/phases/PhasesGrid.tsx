import { SimpleGrid, Stack, Stepper, Text } from '@mantine/core'
import { PhaseStepDescription } from '../PhaseStepDescription'
import { PhaseStepLabel } from '../PhaseStepLabel'
import type { PhaseView, ProjectPhase } from '../phase.types'
import { PhaseCard } from './PhaseCard'
import { PhaseListRow } from './PhaseListRow'

export interface PhaseCallbacks {
  onView: (phase: ProjectPhase) => void
  onStart: (phase: ProjectPhase) => void
  onComplete: (phase: ProjectPhase) => void
  onEdit: (phase: ProjectPhase) => void
  onDelete: (phase: ProjectPhase) => void
}

export function PhasesGrid({
  view,
  phases,
  canManage,
  callbacks,
  stepperActive,
  expandedSummaryIds,
  onToggleSummary,
  onEditSummary,
}: {
  view: PhaseView
  phases: ProjectPhase[]
  canManage: boolean
  callbacks: PhaseCallbacks
  stepperActive: number
  expandedSummaryIds: Set<string>
  onToggleSummary: (id: string) => void
  onEditSummary: (phase: ProjectPhase) => void
}) {
  const cb = callbacks

  if (phases.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        Tidak ada fase yang cocok dengan filter/pencarian.
      </Text>
    )
  }

  if (view === 'grid') {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            canManage={canManage}
            onView={() => cb.onView(phase)}
            onStart={() => cb.onStart(phase)}
            onComplete={() => cb.onComplete(phase)}
            onEdit={() => cb.onEdit(phase)}
            onDelete={() => cb.onDelete(phase)}
          />
        ))}
      </SimpleGrid>
    )
  }

  if (view === 'list') {
    return (
      <Stack gap="xs">
        {phases.map((phase) => (
          <PhaseListRow
            key={phase.id}
            phase={phase}
            canManage={canManage}
            onView={() => cb.onView(phase)}
            onStart={() => cb.onStart(phase)}
            onComplete={() => cb.onComplete(phase)}
            onEdit={() => cb.onEdit(phase)}
            onDelete={() => cb.onDelete(phase)}
          />
        ))}
      </Stack>
    )
  }

  // view === 'stepper'
  return (
    <Stepper active={stepperActive} orientation="vertical" size="sm">
      {phases.map((phase) => (
        <Stepper.Step
          key={phase.id}
          label={
            <PhaseStepLabel
              phase={phase}
              canManage={canManage}
              onView={() => cb.onView(phase)}
              onStart={() => cb.onStart(phase)}
              onComplete={() => cb.onComplete(phase)}
              onEdit={() => cb.onEdit(phase)}
              onDelete={() => cb.onDelete(phase)}
            />
          }
          description={
            <PhaseStepDescription
              phase={phase}
              canManage={canManage}
              expanded={expandedSummaryIds.has(phase.id)}
              onToggleSummary={() => onToggleSummary(phase.id)}
              onEditSummary={() => onEditSummary(phase)}
            />
          }
          color={PHASE_STATUS_STEP_COLOR(phase.status)}
        >
          {phase.description && (
            <Text size="xs" c="dimmed" fs="italic" pb="sm">
              {phase.description}
            </Text>
          )}
        </Stepper.Step>
      ))}
    </Stepper>
  )
}

function PHASE_STATUS_STEP_COLOR(status: ProjectPhase['status']) {
  return status === 'COMPLETED' ? 'green' : status === 'ACTIVE' ? 'blue' : 'gray'
}
