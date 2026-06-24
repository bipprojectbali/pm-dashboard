import type { DropResult } from '@hello-pangea/dnd'
import type { QueryClient, UseQueryResult } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { KANBAN_COLUMNS, api, kanbanAllowed } from './constants'
import type { KanbanFilters, TaskListItem, TaskStatus } from './types'

type ColData = { tasks: TaskListItem[]; total: number }
type ColQueries = Record<TaskStatus, UseQueryResult<ColData>>

export function useKanbanDnd({
  selectedIds,
  setSelectedIds,
  colOffset,
  projectId,
  filters,
  qc,
  colQueries,
}: {
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  colOffset: Record<TaskStatus, number>
  projectId: string | null
  filters: KanbanFilters
  qc: QueryClient
  colQueries: ColQueries
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)

  const allVisibleTasks = KANBAN_COLUMNS.flatMap((col) => colQueries[col.status].data?.tasks ?? [])
  const draggingTask = draggingTaskId ? allVisibleTasks.find((t) => t.id === draggingTaskId) : null
  const allowedTargets = draggingTask ? kanbanAllowed(draggingTask.status, draggingTask.kind) : []

  function handleDragEnd(result: DropResult) {
    setDraggingTaskId(null)
    const { source, destination, draggableId, reason } = result
    if (reason === 'CANCEL' || !destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const srcStatus = source.droppableId as TaskStatus
    const dstStatus = destination.droppableId as TaskStatus

    const allTasks = KANBAN_COLUMNS.flatMap((col) => colQueries[col.status].data?.tasks ?? [])
    const primaryTask = allTasks.find((t) => t.id === draggableId)
    if (!primaryTask) return

    const isMulti = selectedIds.has(draggableId) && selectedIds.size > 1
    const tasksToMove = isMulti
      ? allTasks.filter((t) => selectedIds.has(t.id) && kanbanAllowed(t.status, t.kind).includes(dstStatus))
      : [primaryTask]

    const movedIds = new Set(tasksToMove.map((t) => t.id))
    const originalStatusOf = new Map(tasksToMove.map((t) => [t.id, t.status]))

    if (isMulti) setSelectedIds(new Set())

    const tentativeCols: Record<TaskStatus, TaskListItem[]> = {
      OPEN: [...(colQueries.OPEN.data?.tasks ?? [])],
      IN_PROGRESS: [...(colQueries.IN_PROGRESS.data?.tasks ?? [])],
      READY_FOR_QC: [...(colQueries.READY_FOR_QC.data?.tasks ?? [])],
      REOPENED: [...(colQueries.REOPENED.data?.tasks ?? [])],
      CLOSED: [...(colQueries.CLOSED.data?.tasks ?? [])],
    }

    if (!isMulti) {
      const [moved] = tentativeCols[srcStatus].splice(source.index, 1)
      if (!moved) return
      if (srcStatus !== dstStatus) {
        const allowed = kanbanAllowed(srcStatus, moved.kind)
        if (!allowed.includes(dstStatus)) return
        tentativeCols[dstStatus].splice(destination.index, 0, { ...moved, status: dstStatus })
      } else {
        tentativeCols[dstStatus].splice(destination.index, 0, moved)
      }
    } else {
      for (const status of Object.keys(tentativeCols) as TaskStatus[]) {
        tentativeCols[status] = tentativeCols[status].filter((t) => !movedIds.has(t.id))
      }
      const others = tasksToMove.filter((t) => t.id !== draggableId)
      tentativeCols[dstStatus].splice(
        destination.index,
        0,
        { ...primaryTask, status: dstStatus },
        ...others.map((t) => ({ ...t, status: dstStatus })),
      )
    }

    const affectedStatuses = isMulti
      ? new Set<TaskStatus>([...(originalStatusOf.values() as unknown as TaskStatus[]), dstStatus])
      : new Set<TaskStatus>(srcStatus === dstStatus ? [srcStatus] : [srcStatus, dstStatus])

    for (const status of affectedStatuses) {
      const currentData = colQueries[status].data
      if (currentData) {
        qc.setQueryData(['tasks-kanban', status, projectId, filters, colOffset[status]], {
          ...currentData,
          tasks: tentativeCols[status],
        })
      }
    }

    const updates: Array<{ id: string; kanbanOrder: number; status?: string }> = []
    for (const status of affectedStatuses) {
      tentativeCols[status].forEach((t, idx) => {
        updates.push({
          id: t.id,
          kanbanOrder: idx,
          ...(movedIds.has(t.id) && originalStatusOf.get(t.id) !== dstStatus ? { status: dstStatus } : {}),
        })
      })
    }

    setTimeout(() => {
      api('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(() => {
          for (const s of affectedStatuses) {
            qc.invalidateQueries({ queryKey: ['tasks-kanban', s, projectId] })
          }
          qc.invalidateQueries({ queryKey: ['tasks'] })
        })
        .catch(() => {
          for (const s of KANBAN_COLUMNS.map((c) => c.status)) {
            qc.invalidateQueries({ queryKey: ['tasks-kanban', s, projectId] })
          }
          qc.invalidateQueries({ queryKey: ['tasks'] })
        })
    }, 0)
  }

  return {
    draggingTask,
    allowedTargets,
    allVisibleTasks,
    onDragStart: (initial: { draggableId: string }) => setDraggingTaskId(initial.draggableId),
    onDragEnd: handleDragEnd,
  }
}
