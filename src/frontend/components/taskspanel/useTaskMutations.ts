import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ExportTaskRow } from '../../lib/csv'
import { notifyError, notifySuccess } from '../../lib/notify'
import { api } from './helpers'
import type { TaskKind, TaskListItem, TaskPriority } from './types'

interface CreateTaskBody {
  projectId: string
  title: string
  description: string
  kind: TaskKind
  priority: TaskPriority
  assigneeId: string | null
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  tagIds: string[]
  phaseId: string | null
}

interface BulkCreatePayload {
  projectId: string
  tasks: Array<{
    title: string
    description: string
    kind: string
    priority: string
    startsAt: string | null
    dueAt: string | null
    estimateHours: number | null
    assigneeEmail: string | null
    tagNames: string[]
    phaseName: string | null
  }>
}

export type { BulkCreatePayload, CreateTaskBody }

export function useTaskMutations({
  onCreateSuccess,
  onDeleteOneSuccess,
  onClearSelection,
}: {
  onCreateSuccess: () => void
  onDeleteOneSuccess: (id: string) => void
  onClearSelection: () => void
}) {
  const qc = useQueryClient()

  // Task data is split across several caches by view: ['tasks'] (table/gantt),
  // ['tasks-kanban'] (per-column fetch), ['tasks-chart'] (overlay). Invalidate
  // all of them after a write so every view refreshes without a manual reload.
  // ['phases'] + ['project'] carry task counts (phase chips, Tasks-tab badge)
  // that must also refresh — invalidated by prefix since these boards can span
  // multiple projects and no single projectId is in scope here.
  const invalidateAllTaskViews = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['tasks-kanban'] })
    qc.invalidateQueries({ queryKey: ['tasks-chart'] })
    qc.invalidateQueries({ queryKey: ['phases'] })
    qc.invalidateQueries({ queryKey: ['project'] })
  }

  const create = useMutation({
    mutationFn: (body: CreateTaskBody) =>
      api<{ task: TaskListItem }>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      invalidateAllTaskViews()
      onCreateSuccess()
      notifySuccess({ message: `Task "${res.task.title}" dibuat.` })
    },
    onError: (err) => notifyError(err),
  })

  const bulkCreate = useMutation({
    mutationFn: (body: BulkCreatePayload) =>
      api<{ count: number; ids: string[] }>('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      invalidateAllTaskViews()
      onCreateSuccess()
      notifySuccess({ message: `${res.count} task berhasil dibuat dari CSV.` })
    },
    onError: (err) => notifyError(err),
  })

  const deleteOne = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_, { id }) => {
      invalidateAllTaskViews()
      qc.invalidateQueries({ queryKey: ['tasks-trash'] })
      onDeleteOneSuccess(id)
      notifySuccess({ message: 'Task dipindahkan ke Trash.' })
    },
    onError: (err) => notifyError(err),
  })

  const deleteBulk = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      api<{ deleted: number; denied: number; deniedIds: string[] }>('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reason }),
      }),
    onSuccess: (res) => {
      invalidateAllTaskViews()
      qc.invalidateQueries({ queryKey: ['tasks-trash'] })
      onClearSelection()
      const tail = res.denied > 0 ? ` (${res.denied} ditolak)` : ''
      notifySuccess({ message: `${res.deleted} task dipindahkan ke Trash${tail}.` })
    },
    onError: (err) => notifyError(err),
  })

  return { create, bulkCreate, deleteOne, deleteBulk }
}

export function buildExportRows(tasks: TaskListItem[]): ExportTaskRow[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    status: t.status,
    priority: t.priority,
    startsAt: t.startsAt,
    dueAt: t.dueAt,
    estimateHours: t.estimateHours,
    actualHours: t.actualHours,
    progressPercent: t.progressPercent,
    assigneeEmail: t.assignee?.email ?? null,
    assigneeName: t.assignee?.name ?? null,
    reporterEmail: t.reporter.email,
    projectName: t.project.name,
    phaseTitle: t.phase?.title ?? null,
    tags: t.tags.map((tg) => tg.tag.name),
    createdAt: t.createdAt,
    closedAt: t.closedAt,
  }))
}
