import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { requireAuth } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcActionRoutes() {
  return new Elysia()

    .post('/api/qc/tickets/:id/comments', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, title: true },
      })
      if (!exists) { set.status = 404; return { error: 'Ticket not found' } }
      const body = (await request.json()) as { body?: string }
      if (!body.body?.trim()) { set.status = 400; return { error: 'body wajib diisi' } }
      const comment = await prisma.taskComment.create({
        data: { taskId: params.id, authorId: auth.userId, authorTag: auth.role, body: body.body.trim() },
      })
      emitInvalidate('qc')
      return { comment }
    })

    .post('/api/qc/tickets/:id/evidence', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true },
      })
      if (!exists) { set.status = 404; return { error: 'Ticket not found' } }
      const body = (await request.json()) as { url?: string; note?: string }
      if (!body.url?.trim()) { set.status = 400; return { error: 'url wajib diisi' } }
      const evidence = await prisma.taskEvidence.create({
        data: { taskId: params.id, url: body.url.trim(), kind: 'LINK', note: body.note ?? null },
      })
      emitInvalidate('qc')
      return { evidence }
    })
}
