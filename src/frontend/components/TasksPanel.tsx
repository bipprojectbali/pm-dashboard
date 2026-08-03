import { Modal, ScrollArea, Stack } from '@mantine/core'
import { CreateTaskModal } from './CreateTaskModal'
import { TaskDashboardOverlay } from './TaskDashboardOverlay'
import { TaskDetailView } from './TaskDetailView'
import { TasksFilterBar } from './taskspanel/TasksFilterBar'
import { TasksPanelBody } from './taskspanel/TasksPanelBody'
import { TasksPanelHeader } from './taskspanel/TasksPanelHeader'
import { TasksPhaseBar } from './taskspanel/TasksPhaseBar'
import { useTasksPanelState } from './taskspanel/useTasksPanelState'

export function TasksPanel({
  projectId,
  onProjectChange,
  onBackToProjects,
  canWriteOverride,
  initialAssigneeFilter,
  initialSort,
}: {
  projectId?: string
  onProjectChange?: (id: string | null) => void
  onBackToProjects?: () => void
  canWriteOverride?: boolean
  // Default assignee filter / sort applied once on mount (from the user's
  // tasksDefaultFilter preference). Only wired from the /pm board.
  initialAssigneeFilter?: string | null
  initialSort?: { by: string; dir: 'asc' | 'desc' }
}) {
  const s = useTasksPanelState({ projectId, onProjectChange, canWriteOverride, initialAssigneeFilter, initialSort })

  return (
    <Stack gap="md">
      <TasksPanelHeader
        s={s}
        onBackToProjects={onBackToProjects}
        activeProjectId={s.activeProjectId}
        canWriteOverride={canWriteOverride}
      />

      {s.showCharts && (s.chartTasksQ.data?.tasks ?? s.rawTasks).length > 0 && (
        <TaskDashboardOverlay
          tasks={s.chartTasksQ.data?.tasks ?? s.rawTasks}
          stats={s.dashboardStatsQ.data}
          serverTotal={s.dashboardStatsQ.data?.total}
        />
      )}

      {s.activeProjectId && (
        <TasksPhaseBar
          phases={s.phasesQ.data?.phases ?? []}
          phaseFilter={s.phaseFilter}
          onPhaseChange={s.setPhaseFilter}
        />
      )}

      <TasksFilterBar
        activeProject={s.activeProject}
        projects={s.projects}
        activeProjectId={s.activeProjectId}
        status={s.status}
        onStatusChange={s.setStatus}
        kind={s.kind}
        onKindChange={s.setKind}
        assigneeFilter={s.assigneeFilter}
        onAssigneeFilterChange={s.setAssigneeFilter}
        members={s.members}
        tagFilter={s.tagFilter}
        onTagFilterChange={s.setTagFilter}
        tags={s.tagsQ.data?.tags ?? []}
        search={s.search}
        onSearchChange={s.setSearch}
        quickFilter={s.quickFilter}
        onQuickFilterChange={s.setQuickFilter}
        dueDateRange={s.dueDateRange}
        onDueDateRangeChange={s.setDueDateRange}
        priorityFilter={s.priorityFilter}
        onPriorityFilterChange={s.setPriorityFilter}
        sortBy={s.sortBy}
        onSortByChange={s.setSortBy}
        sortDir={s.sortDir}
        onSortDirToggle={() => s.setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        view={s.view}
        onViewChange={s.setView}
        onProjectChange={s.changeProject}
        total={s.total}
        taskCount={s.tasks.length}
        onExport={s.handleExport}
        showClearAll={s.showClearAll}
        onClearAll={s.clearAllFilters}
      />

      <TasksPanelBody s={s} activeProjectId={s.activeProjectId} canWriteOverride={canWriteOverride} />

      <CreateTaskModal
        opened={s.createOpen}
        onClose={() => s.setCreateOpen(false)}
        projects={s.writableProjects}
        defaultProjectId={s.activeProjectId ?? s.writableProjects[0]?.id ?? null}
        onSubmit={(body) => s.create.mutate(body)}
        onBulkSubmit={(body) => s.bulkCreate.mutate(body)}
        loading={s.create.isPending || s.bulkCreate.isPending}
        error={s.create.error?.message ?? s.bulkCreate.error?.message}
        tagsByProject={s.tagsQ.data?.tags ?? []}
        resetSignal={s.createResetSignal}
      />

      <Modal
        opened={!!s.drawerTaskId}
        onClose={s.closeTask}
        centered
        size="min(90vw, 1100px)"
        withCloseButton={false}
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ blur: 4, backgroundOpacity: 0.45 }}
        transitionProps={{ transition: 'fade-up', duration: 220 }}
        radius="lg"
        styles={{ content: { maxHeight: '90vh' }, body: { padding: 'var(--mantine-spacing-lg)' } }}
      >
        {s.drawerTaskId && <TaskDetailView taskId={s.drawerTaskId} onBack={s.closeTask} />}
      </Modal>
    </Stack>
  )
}
