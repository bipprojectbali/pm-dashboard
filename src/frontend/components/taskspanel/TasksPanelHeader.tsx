import { ActionIcon, Button, Group, Text, Title, Tooltip } from '@mantine/core'
import { TbArrowLeft, TbChartBar, TbChevronRight, TbPlus, TbRefresh, TbTrash } from 'react-icons/tb'
import type { TasksPanelState } from './panel-state'

// Breadcrumb + title + action buttons (dashboard toggle / trash / refresh / new).
// Extracted verbatim from TasksPanel to keep that file within file-health limits.
export function TasksPanelHeader({
  s,
  onBackToProjects,
  activeProjectId,
  canWriteOverride,
}: {
  s: TasksPanelState
  onBackToProjects?: () => void
  activeProjectId?: string | null
  canWriteOverride?: boolean
}) {
  const { activeProject, writableProjects, showCharts, setShowCharts, trashView, setTrashView, tasksQ, setCreateOpen } =
    s

  return (
    <>
      {activeProject && (
        <Group gap={6} wrap="nowrap">
          {onBackToProjects && (
            <Tooltip label="Back to projects">
              <ActionIcon variant="subtle" size="sm" onClick={onBackToProjects}>
                <TbArrowLeft size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Text
            size="xs"
            c="dimmed"
            style={{ cursor: onBackToProjects ? 'pointer' : undefined }}
            onClick={onBackToProjects}
          >
            Projects
          </Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed">
            {activeProject.name}
          </Text>
          <TbChevronRight size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" fw={500}>
            Tasks
          </Text>
        </Group>
      )}

      <Group justify="space-between">
        <div>
          <Title order={3}>{activeProject ? `${activeProject.name} · Tasks` : 'Tasks'}</Title>
          <Text c="dimmed" size="sm">
            {activeProject
              ? `All tasks, bugs, and QC items in ${activeProject.name}.`
              : 'Unified task + bug + QC view across your projects.'}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label={showCharts ? 'Hide dashboard' : 'Show dashboard'}>
            <ActionIcon variant="light" onClick={() => setShowCharts((v) => !v)}>
              <TbChartBar size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={trashView ? 'Kembali ke task' : 'Lihat Trash'}>
            <ActionIcon
              variant={trashView ? 'filled' : 'light'}
              color={trashView ? 'red' : 'gray'}
              onClick={() => setTrashView((v) => !v)}
            >
              <TbTrash size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={() => tasksQ.refetch()} loading={tasksQ.isFetching}>
              <TbRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              activeProjectId && canWriteOverride === false
                ? 'Kamu bukan anggota proyek ini — tidak bisa menambah task'
                : writableProjects.length === 0
                  ? 'Tidak ada proyek yang bisa ditulis'
                  : ''
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
    </>
  )
}
