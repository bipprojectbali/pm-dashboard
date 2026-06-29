import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifyError, notifySuccess } from '../../lib/notify'
import { api } from './helpers'
import type { TagListItem, TaskDetail } from './types'

type Opts = {
  taskId: string
  task: TaskDetail | undefined
  onBack: () => void
  setEditingTitle: (v: boolean) => void
  setEditingDescription: (v: boolean) => void
}

export function useTaskMutations({ taskId, task, onBack, setEditingTitle, setEditingDescription }: Opts) {
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (body: Partial<Pick<TaskDetail, 'status' | 'priority'>> & {
      title?: string; description?: string; route?: string | null; assigneeId?: string | null
      phaseId?: string | null; startsAt?: string | null; dueAt?: string | null
      estimateHours?: number | null; progressPercent?: number | null; tagIds?: string[]
    }) =>
      api<{ task: TaskDetail }>(`/api/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Task diperbarui.' })
      if ('title' in variables) setEditingTitle(false)
      if ('description' in variables) setEditingDescription(false)
    },
    onError: (err) => notifyError(err),
  })

  const deleteM = useMutation({
    mutationFn: (reason: string) =>
      api<{ ok: true }>(`/api/tasks/${taskId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Task dipindahkan ke Trash.' })
      onBack()
    },
    onError: (err) => notifyError(err),
  })

  const addDependency = useMutation({
    mutationFn: (blockedById: string) =>
      api(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockedById }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Dependency ditambahkan.' }) },
    onError: (err) => notifyError(err),
  })

  const removeDependency = useMutation({
    mutationFn: (blockedById: string) =>
      api(`/api/tasks/${taskId}/dependencies/${blockedById}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Dependency dihapus.' }) },
    onError: (err) => notifyError(err),
  })

  const addChecklist = useMutation({
    mutationFn: (title: string) =>
      api(`/api/tasks/${taskId}/checklist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); qc.invalidateQueries({ queryKey: ['tasks'] }) },
    onError: (err) => notifyError(err),
  })

  const updateChecklist = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { done?: boolean; title?: string } }) =>
      api(`/api/checklist/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); qc.invalidateQueries({ queryKey: ['tasks'] }) },
    onError: (err) => notifyError(err),
  })

  const removeChecklist = useMutation({
    mutationFn: (id: string) => api(`/api/checklist/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); qc.invalidateQueries({ queryKey: ['tasks'] }) },
    onError: (err) => notifyError(err),
  })

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api<{ tag: TagListItem }>(`/api/projects/${task?.projectId}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tags', task?.projectId] })
      notifySuccess({ message: `Tag "${res.tag.name}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const addComment = useMutation({
    mutationFn: (body: string) =>
      api(`/api/tasks/${taskId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Komentar dikirim.' }) },
    onError: (err) => notifyError(err),
  })

  const editComment = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Komentar diperbarui.' }) },
    onError: (err) => notifyError(err),
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      api(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Komentar dihapus.' }) },
    onError: (err) => notifyError(err),
  })

  const addEvidence = useMutation({
    mutationFn: (body: { kind: string; url: string; note?: string }) =>
      api(`/api/tasks/${taskId}/evidence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task', taskId] }); notifySuccess({ message: 'Evidence ditambahkan.' }) },
    onError: (err) => notifyError(err),
  })

  return { update, deleteM, addDependency, removeDependency, addChecklist, updateChecklist, removeChecklist, createTag, addComment, editComment, deleteComment, addEvidence }
}
