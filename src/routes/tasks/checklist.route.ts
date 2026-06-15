import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { requireAuth, requireProjectMember } from '../../lib/route-helpers'

export function taskChecklistRoutes() {
  return new Elysia()
    .post('/api/tasks/:id/checklist', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const task = await prisma.task.findUnique({
        where: { id: params.id, deletedAt: null },
        select: { projectId: true },
      })
      if (!task) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      const body = (await request.json()) as { title?: string }
      if (!body.title?.trim()) {
        set.status = 400
        return { error: 'title wajib diisi' }
      }
      const last = await prisma.taskChecklistItem.findFirst({
        where: { taskId: params.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const item = await prisma.taskChecklistItem.create({
        data: { taskId: params.id, title: body.title.trim(), order: (last?.order ?? -1) + 1 },
      })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { item }
    })

    .patch('/api/checklist/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const existing = await prisma.taskChecklistItem.findUnique({
        where: { id: params.id },
        include: { task: { select: { projectId: true } } },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Checklist item not found' }
      }
      const membership = await requireProjectMember(existing.task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      const body = (await request.json()) as { title?: string; done?: boolean; order?: number }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title.trim()
      if (body.done !== undefined) data.done = body.done
      if (body.order !== undefined) data.order = body.order
      const item = await prisma.taskChecklistItem.update({ where: { id: params.id }, data })
      emitInvalidate('tasks', { projectId: existing.task.projectId })
      return { item }
    })

    .delete('/api/checklist/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const existing = await prisma.taskChecklistItem.findUnique({
        where: { id: params.id },
        include: { task: { select: { projectId: true } } },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Checklist item not found' }
      }
      const membership = await requireProjectMember(existing.task.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      await prisma.taskChecklistItem.delete({ where: { id: params.id } })
      emitInvalidate('tasks', { projectId: existing.task.projectId })
      return { ok: true }
    })
}
