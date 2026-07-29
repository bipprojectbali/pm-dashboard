import { Button, Group, Stack, Text } from '@mantine/core'
import { TbListCheck, TbPlus } from 'react-icons/tb'
import { TasksGanttView } from '../TasksGanttView'
import { TasksKanbanView } from '../TasksKanbanView'
import { TasksTrashView } from '../TasksTrashView'
import type { TasksPanelState } from './panel-state'
import { TasksTableView } from './TasksTableView'
import { PAGE_SIZE } from './useTasksPanelState'

// The view switch (trash / kanban / empty-state / gantt / table). Extracted
// verbatim from TasksPanel to keep that file within file-health limits.
export function TasksPanelBody({
  s,
  activeProjectId,
  canWriteOverride,
}: {
  s: TasksPanelState
  activeProjectId?: string | null
  canWriteOverride?: boolean
}) {
  const {
    activeProject,
    writableProjects,
    tasks,
    tasksQ,
    view,
    trashView,
    kind,
    assigneeFilter,
    currentUserId,
    tagFilter,
    phaseFilter,
    search,
    priorityFilter,
    canDeleteTask,
    openTask,
    confirmDeleteOne,
    confirmDeleteByIds,
    confirmDeleteSelected,
    changeProject,
    setCreateOpen,
    total,
    page,
    setPage,
    safePage,
    totalPages,
    selectedIds,
    toggleSelection,
    toggleAllSelection,
    clearSelection,
    allDeletableSelected,
    someDeletableSelected,
    deletableTasks,
    deletableSelected,
    deleteBulk,
    deleteOne,
  } = s

  return (
    <>
      {trashView ? (
        <TasksTrashView projectId={activeProjectId} />
      ) : view === 'kanban' ? (
        <TasksKanbanView
          projectId={activeProjectId ?? null}
          filters={{
            kind: kind || null,
            assigneeFilter,
            currentUserId,
            tagId: tagFilter || null,
            phaseId: phaseFilter || null,
            search: search.trim() || undefined,
            priority: priorityFilter || null,
          }}
          canWrite={
            activeProjectId ? canWriteOverride !== false && writableProjects.length > 0 : writableProjects.length > 0
          }
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
              {writableProjects.length === 0
                ? 'Join a project to start creating tasks.'
                : activeProject
                  ? 'Kick things off by creating the first task for this project.'
                  : 'Try clearing filters or creating a new task.'}
            </Text>
            {writableProjects.length > 0 && (
              <Group gap="xs">
                {!(activeProjectId && canWriteOverride === false) && (
                  <Button leftSection={<TbPlus size={14} />} size="xs" onClick={() => setCreateOpen(true)}>
                    New Task
                  </Button>
                )}
                {activeProject && (
                  <Button variant="subtle" size="xs" onClick={() => changeProject(null)}>
                    View all tasks
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </div>
      ) : view === 'gantt' ? (
        <TasksGanttView tasks={tasks} onSelect={openTask} />
      ) : (
        <TasksTableView
          tasks={tasks}
          activeProject={activeProject}
          total={total}
          page={page}
          setPage={setPage}
          safePage={safePage}
          totalPages={totalPages}
          PAGE_SIZE={PAGE_SIZE}
          selectedIds={selectedIds}
          toggleSelection={toggleSelection}
          toggleAllSelection={toggleAllSelection}
          clearSelection={clearSelection}
          allDeletableSelected={allDeletableSelected}
          someDeletableSelected={someDeletableSelected}
          deletableTasks={deletableTasks}
          deletableSelected={deletableSelected}
          deleteBulkPending={deleteBulk.isPending}
          deleteOnePending={deleteOne.isPending}
          deleteOneId={deleteOne.variables?.id}
          onDeleteOne={confirmDeleteOne}
          onDeleteSelected={confirmDeleteSelected}
          canDeleteTask={canDeleteTask}
          onOpen={openTask}
        />
      )}
    </>
  )
}
