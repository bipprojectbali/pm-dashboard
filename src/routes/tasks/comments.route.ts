import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { notifyTaskCommented } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { isSystemAdmin, requireAuth, requireProjectMember } from '../../lib/route-helpers'

export function taskCommentsRoutes() {
  return new Elysia().post('/api/tasks/:id/comments', async ({ request, params, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const task = await prisma.task.findUnique({
      where: { id: params.id, deletedAt: null },
      select: { projectId: true, title: true, reporterId: true, assigneeId: true },
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
    const { body: text } = (await request.json()) as { body?: string }
    if (!text?.trim()) {
      set.status = 400
      return { error: 'body wajib diisi' }
    }
    const comment = await prisma.taskComment.create({
      data: { taskId: params.id, authorId: auth.userId, authorTag: membership.role, body: text },
      include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
    })
    const snippet = text.trim().length > 120 ? `${text.trim().slice(0, 120)}…` : text.trim()
    notifyTaskCommented({
      taskId: params.id,
      projectId: task.projectId,
      taskTitle: task.title,
      reporterId: task.reporterId,
      assigneeId: task.assigneeId,
      actorId: auth.userId,
      actorName: comment.author?.name ?? 'Someone',
      commentSnippet: snippet,
    }).catch(() => {})
    emitInvalidate('tasks', { projectId: task.projectId })
    return { comment }
  })
    .patch('/api/tasks/:id/comments/:commentId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const comment = await prisma.taskComment.findFirst({
        where: { id: params.commentId, task: { id: params.id, deletedAt: null } },
        select: { id: true, authorId: true, task: { select: { projectId: true } } },
      })
      if (!comment) {
        set.status = 404
        return { error: 'Comment not found' }
      }
      const membership = await requireProjectMember(comment.task.projectId, auth.userId)
      if (!membership && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Not a project member' }
      }
      if (comment.authorId !== auth.userId && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Hanya penulis atau admin yang bisa mengubah komentar' }
      }
      const { body: text } = (await request.json()) as { body?: string }
      if (!text?.trim()) {
        set.status = 400
        return { error: 'body wajib diisi' }
      }
      const updated = await prisma.taskComment.update({
        where: { id: comment.id },
        data: { body: text.trim(), editedAt: new Date() },
        include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      emitInvalidate('tasks', { projectId: comment.task.projectId })
      return { comment: updated }
    })
    .delete('/api/tasks/:id/comments/:commentId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const comment = await prisma.taskComment.findFirst({
        where: { id: params.commentId, task: { id: params.id, deletedAt: null } },
        select: { id: true, authorId: true, task: { select: { projectId: true } } },
      })
      if (!comment) {
        set.status = 404
        return { error: 'Comment not found' }
      }
      const membership = await requireProjectMember(comment.task.projectId, auth.userId)
      if (!membership && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Not a project member' }
      }
      if (comment.authorId !== auth.userId && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Hanya penulis atau admin yang bisa menghapus komentar' }
      }
      await prisma.taskComment.delete({ where: { id: comment.id } })
      emitInvalidate('tasks', { projectId: comment.task.projectId })
      return { ok: true, deleted: { id: comment.id } }
    })
}
