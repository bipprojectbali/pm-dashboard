import { Alert, Button, Group, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbAlertTriangle, TbRefresh } from 'react-icons/tb'
import { useSession } from '@/frontend/hooks/useAuth'
import { notifyError } from '../lib/notify'
import { DeleteReasonModal } from './taskdetail/DeleteReasonModal'
import { TaskDetailHeader } from './taskdetail/TaskDetailHeader'
import { TaskDetailLeftPanel } from './taskdetail/TaskDetailLeftPanel'
import { TaskDetailSidebar } from './taskdetail/TaskDetailSidebar'
import { useTaskMutations } from './taskdetail/useTaskMutations'
import { api } from './taskdetail/helpers'
import type { ProjectDetail, ProjectMemberRole, TagListItem, TaskDetail } from './taskdetail/types'

export function TaskDetailView({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const taskQ = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<{ task: TaskDetail }>(`/api/tasks/${taskId}`),
  })
  const task = taskQ.data?.task

  const projectQ = useQuery({
    queryKey: ['project', task?.projectId],
    queryFn: () =>
      api<{ project: ProjectDetail; myRole: ProjectMemberRole | null }>(`/api/projects/${task?.projectId}`),
    enabled: !!task?.projectId,
  })
  const myRole = projectQ.data?.myRole ?? null
  const canWrite = myRole !== null && myRole !== 'VIEWER'

  const phasesQ = useQuery({
    queryKey: ['phases', task?.projectId],
    queryFn: () =>
      api<{ phases: Array<{ id: string; title: string; status: string }> }>(`/api/projects/${task?.projectId}/phases`),
    enabled: !!task?.projectId,
  })

  const tagsQ = useQuery({
    queryKey: ['tags', task?.projectId],
    queryFn: () => api<{ tags: TagListItem[] }>(`/api/projects/${task?.projectId}/tags`),
    enabled: !!task?.projectId,
  })

  const projectTasksQ = useQuery({
    queryKey: ['tasks', `projectId=${task?.projectId}`],
    queryFn: () =>
      api<{ tasks: Array<{ id: string; title: string; status: TaskDetail['status'] }> }>(
        `/api/tasks?projectId=${task?.projectId}`,
      ),
    enabled: !!task?.projectId,
  })

  const session = useSession()
  const sessionRole = session.data?.user?.role
  const canDelete = sessionRole === 'SUPER_ADMIN' || myRole === 'OWNER' || myRole === 'PM'

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')

  useEffect(() => {
    if (!editingTitle && task) setDraftTitle(task.title)
  }, [editingTitle, task])
  useEffect(() => {
    if (!editingDescription && task) setDraftDescription(task.description ?? '')
  }, [editingDescription, task])

  const {
    update, deleteM, addDependency, removeDependency,
    addChecklist, updateChecklist, removeChecklist,
    createTag, addComment, editComment, deleteComment, addEvidence,
  } = useTaskMutations({ taskId, task, onBack, setEditingTitle, setEditingDescription })

  const currentUser = session.data?.user ? { id: session.data.user.id, role: session.data.user.role } : null

  useHotkeys([['Escape', onBack]])

  const isOverdue = !!(task?.dueAt && task.status !== 'CLOSED' && new Date(task.dueAt) < new Date())

  const saveTitle = () => {
    if (!task) return
    const title = draftTitle.trim()
    if (!title) { notifyError({ message: 'Title wajib diisi.' }); return }
    if (title.length > 500) { notifyError({ message: 'Title maksimum 500 karakter.' }); return }
    if (title === task.title) { setEditingTitle(false); return }
    update.mutate({ title })
  }

  const saveDescription = () => {
    if (!task) return
    const description = draftDescription
    if (description === (task.description ?? '')) { setEditingDescription(false); return }
    update.mutate({ description })
  }

  const confirmDelete = () => {
    modals.open({
      title: 'Hapus task?',
      children: (
        <DeleteReasonModal
          taskTitle={task?.title ?? ''}
          onConfirm={(reason) => { deleteM.mutate(reason); modals.closeAll() }}
          onCancel={() => modals.closeAll()}
        />
      ),
    })
  }

  return (
    <Stack gap={0}>
      <TaskDetailHeader
        task={task}
        taskId={taskId}
        canDelete={canDelete}
        isSyncing={taskQ.isFetching && !taskQ.isLoading}
        isFetching={taskQ.isFetching}
        onBack={onBack}
        onRefetch={() => taskQ.refetch()}
        onDelete={confirmDelete}
        deletePending={deleteM.isPending}
      />

      {taskQ.isLoading ? (
        <Stack gap="md" p="md">
          <Group gap="sm" align="flex-start">
            <Skeleton height={44} width={44} radius="md" />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton height={22} width="55%" />
              <Skeleton height={13} width="40%" />
              <Group gap={6}>
                <Skeleton height={18} width={52} radius="xl" />
                <Skeleton height={18} width={68} radius="xl" />
              </Group>
            </Stack>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {(['sk-a', 'sk-b', 'sk-c', 'sk-d'] as const).map((id, i) => (
              <Skeleton key={id} height={[80, 80, 120, 120][i]} radius="md" />
            ))}
          </SimpleGrid>
        </Stack>
      ) : taskQ.error ? (
        <Alert color="red" icon={<TbAlertTriangle size={16} />} title="Gagal memuat" m="md" radius="md">
          <Stack gap="xs">
            <Text size="sm">{(taskQ.error as Error).message}</Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<TbRefresh size={13} />}
                onClick={() => taskQ.refetch()}
              >
                Coba lagi
              </Button>
              <Button size="xs" variant="subtle" onClick={onBack}>
                Kembali
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : !task ? (
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} m="md" radius="md">
          Task tidak ditemukan atau kamu tidak punya akses.
        </Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} style={{ minHeight: 0 }}>
          <TaskDetailLeftPanel
            task={task}
            canWrite={canWrite}
            isOverdue={isOverdue}
            editingTitle={editingTitle}
            draftTitle={draftTitle}
            onDraftTitleChange={(v) => { setDraftTitle(v); setEditingTitle(true) }}
            onSaveTitle={saveTitle}
            onCancelTitle={() => setEditingTitle(false)}
            editingDescription={editingDescription}
            draftDescription={draftDescription}
            onDraftDescriptionChange={(v) => { setDraftDescription(v); setEditingDescription(true) }}
            onSaveDescription={saveDescription}
            onCancelDescription={() => setEditingDescription(false)}
            updatePending={update.isPending}
            onChecklistToggle={(id, done) => updateChecklist.mutate({ id, body: { done } })}
            onChecklistAdd={(title) => addChecklist.mutate(title)}
            onChecklistRemove={(id) => removeChecklist.mutate(id)}
            checklistAdding={addChecklist.isPending}
            currentUser={currentUser}
            onCommentSubmit={(body) => addComment.mutate(body)}
            onCommentEdit={(commentId, body) => editComment.mutate({ commentId, body })}
            onCommentDelete={(commentId) => deleteComment.mutate(commentId)}
            commentEditingId={editComment.isPending ? editComment.variables?.commentId ?? null : null}
            commentDeletingId={deleteComment.isPending ? deleteComment.variables ?? null : null}
            commentLoading={addComment.isPending}
            commentError={addComment.error ? (addComment.error as Error).message : undefined}
            onEvidenceSubmit={(body) => addEvidence.mutate(body)}
            evidenceLoading={addEvidence.isPending}
            evidenceError={addEvidence.error ? (addEvidence.error as Error).message : undefined}
            projectTasks={projectTasksQ.data?.tasks ?? []}
            onDependencyAdd={(blockedById) => addDependency.mutate(blockedById)}
            onDependencyRemove={(blockedById) => removeDependency.mutate(blockedById)}
          />
          <TaskDetailSidebar
            task={task}
            canWrite={canWrite}
            projectMembers={projectQ.data?.project.members ?? []}
            phases={phasesQ.data?.phases ?? []}
            tags={tagsQ.data?.tags ?? []}
            isOverdue={isOverdue}
            updatePending={update.isPending}
            updateError={update.error as Error | null}
            onUpdate={(body) => update.mutate(body as Parameters<typeof update.mutate>[0])}
            onCreateTag={(name) => createTag.mutate(name)}
            creatingTag={createTag.isPending}
          />
        </SimpleGrid>
      )}
    </Stack>
  )
}
