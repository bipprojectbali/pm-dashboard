import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { getIp, isSystemAdmin, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

// Edit/delete of an existing QC ticket comment. Allowed for the comment's own
// author OR any system admin (ADMIN/SUPER_ADMIN) — same creator-or-admin rule
// used by events and request-revision.
export function qcCommentRoutes() {
  return new Elysia()
    .patch('/api/qc/tickets/:id/comments/:commentId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const comment = await prisma.taskComment.findFirst({
        where: { id: params.commentId, task: { id: params.id, projectId: selfProject.id } },
        select: { id: true, authorId: true },
      })
      if (!comment) { set.status = 404; return { error: 'Comment not found' } }
      if (comment.authorId !== auth.userId && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Hanya penulis atau admin yang bisa mengubah komentar' }
      }
      const body = (await request.json()) as { body?: string }
      if (!body.body?.trim()) { set.status = 400; return { error: 'body wajib diisi' } }
      const updated = await prisma.taskComment.update({
        where: { id: comment.id },
        data: { body: body.body.trim(), editedAt: new Date() },
        include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      writeAuditLog(auth.userId, 'QC_COMMENT_EDITED', `#${params.id} comment ${comment.id}`, getIp(request))
      emitInvalidate('qc')
      return { comment: updated }
    })

    .delete('/api/qc/tickets/:id/comments/:commentId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const comment = await prisma.taskComment.findFirst({
        where: { id: params.commentId, task: { id: params.id, projectId: selfProject.id } },
        select: { id: true, authorId: true },
      })
      if (!comment) { set.status = 404; return { error: 'Comment not found' } }
      if (comment.authorId !== auth.userId && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Hanya penulis atau admin yang bisa menghapus komentar' }
      }
      await prisma.taskComment.delete({ where: { id: comment.id } })
      writeAuditLog(auth.userId, 'QC_COMMENT_DELETED', `#${params.id} comment ${comment.id}`, getIp(request))
      appLog('info', `QC comment deleted: ${comment.id} on #${params.id} by ${auth.email}`)
      emitInvalidate('qc')
      return { ok: true, deleted: { id: comment.id } }
    })
}
