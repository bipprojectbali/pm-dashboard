import { ActionIcon, Button, Group, Modal, ScrollArea, Stack, Text, Title, Tooltip } from '@mantine/core'
import { TbArrowLeft, TbChartBar, TbChevronRight, TbListCheck, TbPlus, TbRefresh, TbTrash } from 'react-icons/tb'
import { CreateTaskModal } from './CreateTaskModal'
import { TaskDashboardOverlay } from './TaskDashboardOverlay'
import { TaskDetailView } from './TaskDetailView'
import { TasksGanttView } from './TasksGanttView'
import { TasksKanbanView } from './TasksKanbanView'
import { TasksTrashView } from './TasksTrashView'
import { TasksFilterBar } from './taskspanel/TasksFilterBar'
import { TasksPhaseBar } from './taskspanel/TasksPhaseBar'
import { TasksTableView } from './taskspanel/TasksTableView'
import { PAGE_SIZE, useTasksPanelState } from './taskspanel/useTasksPanelState'

export function TasksPanel({
  projectId,
  onProjectChange,
  onBackToProjects,
  canWriteOverride,
}: {
  projectId?: string
  onProjectChange?: (id: string | null) => void
  onBackToProjects?: () => void
  canWriteOverride?: boolean
}) {
  const {
    projects, writableProjects, activeProjectId, activeProject, canDeleteTask,
    tasksQ, tagsQ, phasesQ, chartTasksQ,
    rawTasks, tasks, total, totalPages, safePage,
    status, setStatus, kind, setKind, mine, setMine,
    tagFilter, setTagFilter, phaseFilter, setPhaseFilter,
    search, setSearch, quickFilter, setQuickFilter,
    dueDateRange, setDueDateRange, priorityFilter, setPriorityFilter,
    sortBy, setSortBy, sortDir, setSortDir, showClearAll, clearAllFilters,
    view, setView, showCharts, setShowCharts, trashView, setTrashView,
    page, setPage,
    selectedIds, toggleSelection, toggleAllSelection, clearSelection,
    allDeletableSelected, someDeletableSelected, deletableTasks, deletableSelected,
    create, bulkCreate, deleteOne, deleteBulk,
    openTask, closeTask, changeProject,
    confirmDeleteOne, confirmDeleteByIds, confirmDeleteSelected, handleExport,
    drawerTaskId, createOpen, setCreateOpen,
  } = useTasksPanelState({ projectId, onProjectChange, canWriteOverride })

  return (
    <Stack gap="md">
      {activeProject && (
        <Group gap={6} wrap="nowrap">
          {onBackToProjects && (
            <Tooltip label="Back to projects">
              <ActionIcon variant="subtle" size="sm" onClick={onBackToProjects}><TbArrowLeft size={14} /></ActionIcon>
            </Tooltip>
          )}
          <Text size="xs" c="dimmed" style={{ cursor: onBackToProjects ? 'pointer' : undefined }} onClick={onBackToProjects}>Projects</Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed">{activeProject.name}</Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" fw={500}>Tasks</Text>
        </Group>
      )}

      <Group justify="space-between">
        <div>
          <Title order={3}>{activeProject ? `${activeProject.name} · Tasks` : 'Tasks'}</Title>
          <Text c="dimmed" size="sm">
            {activeProject ? `All tasks, bugs, and QC items in ${activeProject.name}.` : 'Unified task + bug + QC view across your projects.'}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label={showCharts ? 'Hide dashboard' : 'Show dashboard'}>
            <ActionIcon variant="light" onClick={() => setShowCharts((v) => !v)}><TbChartBar size={16} /></ActionIcon>
          </Tooltip>
          <Tooltip label={trashView ? 'Kembali ke task' : 'Lihat Trash'}>
            <ActionIcon variant={trashView ? 'filled' : 'light'} color={trashView ? 'red' : 'gray'} onClick={() => setTrashView((v) => !v)}>
              <TbTrash size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={() => tasksQ.refetch()} loading={tasksQ.isFetching}><TbRefresh size={16} /></ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              activeProjectId && canWriteOverride === false ? 'Kamu bukan anggota proyek ini — tidak bisa menambah task'
                : writableProjects.length === 0 ? 'Tidak ada proyek yang bisa ditulis' : ''
            }
            disabled={!((activeProjectId && canWriteOverride === false) || writableProjects.length === 0)}
          >
            <Button
              leftSection={<TbPlus size={16} />}
              onClick={() => setCreateOpen(true)}
              disabled={writableProjects.length === 0 || (activeProjectId ? canWriteOverride === false : false)}
            >
              New Task
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {showCharts && (chartTasksQ.data?.tasks ?? rawTasks).length > 0 && (
        <TaskDashboardOverlay tasks={chartTasksQ.data?.tasks ?? rawTasks} />
      )}

      {activeProjectId && (
        <TasksPhaseBar phases={phasesQ.data?.phases ?? []} phaseFilter={phaseFilter} onPhaseChange={setPhaseFilter} />
      )}

      <TasksFilterBar
        activeProject={activeProject} projects={projects} activeProjectId={activeProjectId}
        status={status} onStatusChange={setStatus} kind={kind} onKindChange={setKind}
        mine={mine} onMineChange={setMine} tagFilter={tagFilter} onTagFilterChange={setTagFilter}
        tags={tagsQ.data?.tags ?? []} search={search} onSearchChange={setSearch}
        quickFilter={quickFilter} onQuickFilterChange={setQuickFilter}
        dueDateRange={dueDateRange} onDueDateRangeChange={setDueDateRange}
        priorityFilter={priorityFilter} onPriorityFilterChange={setPriorityFilter}
        sortBy={sortBy} onSortByChange={setSortBy} sortDir={sortDir}
        onSortDirToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        view={view} onViewChange={setView} onProjectChange={changeProject}
        total={total} taskCount={tasks.length} onExport={handleExport}
        showClearAll={showClearAll} onClearAll={clearAllFilters}
      />

      {trashView ? (
        <TasksTrashView projectId={activeProjectId} />
      ) : view === 'kanban' ? (
        <TasksKanbanView
          projectId={activeProjectId ?? null}
          filters={{ kind: kind || null, mine, tagId: tagFilter || null, phaseId: phaseFilter || null, search: search.trim() || undefined, priority: priorityFilter || null }}
          canWrite={activeProjectId ? canWriteOverride !== false && writableProjects.length > 0 : writableProjects.length > 0}
          onSelect={openTask}
          onDeleteOne={confirmDeleteOne}
          onDeleteSelected={confirmDeleteByIds}
          canDeleteTask={canDeleteTask}
        />
      ) : tasks.length === 0 && !tasksQ.isLoading ? (
        <div style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', padding: 40 }}>
          <Stack align="center" gap="sm">
            <TbListCheck size={40} />
            <Text fw={500}>{activeProject ? `No tasks in ${activeProject.name} yet` : 'No tasks found'}</Text>
            <Text size="sm" c="dimmed" ta="center">
              {writableProjects.length === 0 ? 'Join a project to start creating tasks.'
                : activeProject ? 'Kick things off by creating the first task for this project.'
                : 'Try clearing filters or creating a new task.'}
            </Text>
            {writableProjects.length > 0 && (
              <Group gap="xs">
                {!(activeProjectId && canWriteOverride === false) && (
                  <Button leftSection={<TbPlus size={14} />} size="xs" onClick={() => setCreateOpen(true)}>New Task</Button>
                )}
                {activeProject && <Button variant="subtle" size="xs" onClick={() => changeProject(null)}>View all tasks</Button>}
              </Group>
            )}
          </Stack>
        </div>
      ) : view === 'gantt' ? (
        <TasksGanttView tasks={tasks} onSelect={openTask} />
      ) : (
        <TasksTableView
          tasks={tasks} activeProject={activeProject} total={total} page={page} setPage={setPage}
          safePage={safePage} totalPages={totalPages} PAGE_SIZE={PAGE_SIZE}
          selectedIds={selectedIds} toggleSelection={toggleSelection} toggleAllSelection={toggleAllSelection}
          clearSelection={clearSelection} allDeletableSelected={allDeletableSelected}
          someDeletableSelected={someDeletableSelected} deletableTasks={deletableTasks}
          deletableSelected={deletableSelected} deleteBulkPending={deleteBulk.isPending}
          deleteOnePending={deleteOne.isPending} deleteOneId={deleteOne.variables?.id}
          onDeleteOne={confirmDeleteOne} onDeleteSelected={confirmDeleteSelected}
          canDeleteTask={canDeleteTask} onOpen={openTask}
        />
      )}

      <CreateTaskModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={writableProjects}
        defaultProjectId={activeProjectId ?? writableProjects[0]?.id ?? null}
        onSubmit={(body) => create.mutate(body)}
        onBulkSubmit={(body) => bulkCreate.mutate(body)}
        loading={create.isPending || bulkCreate.isPending}
        error={create.error?.message ?? bulkCreate.error?.message}
        tagsByProject={tagsQ.data?.tags ?? []}
      />

      <Modal
        opened={!!drawerTaskId}
        onClose={closeTask}
        centered
        size="min(90vw, 1100px)"
        withCloseButton={false}
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ blur: 4, backgroundOpacity: 0.45 }}
        transitionProps={{ transition: 'fade-up', duration: 220 }}
        radius="lg"
        styles={{ content: { maxHeight: '90vh' }, body: { padding: 'var(--mantine-spacing-lg)' } }}
      >
        {drawerTaskId && <TaskDetailView taskId={drawerTaskId} onBack={closeTask} />}
      </Modal>
    </Stack>
  )
}
