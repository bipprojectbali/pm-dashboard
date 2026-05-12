import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { appLog } from '../lib/applog'
import { emitInvalidate } from '../lib/presence'
import { AI_QUEUE_TAG, ensureAiQueueTag, getSelfProject } from '../lib/self-project'
import { getIp, requireAuth } from '../lib/route-helpers'

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

export function qcRoutes() {
  return new Elysia()

    .get('/api/qc/context', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        return { selfProject: null, canWrite: true, stats: null }
      }
      const grouped = await prisma.task.groupBy({
        by: ['status'],
        where: { projectId: selfProject.id, tags: { some: { tag: { name: AI_QUEUE_TAG } } } },
        _count: true,
      })
      const stats = { OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0 } as Record<string, number>
      for (const g of grouped) stats[g.status] = g._count
      return { selfProject, canWrite: true, stats }
    })

    .get('/api/qc/tickets', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) return { tickets: [], selfProject: null }
      const statusParam = typeof query.status === 'string' ? query.status : 'all'
      const statusFilter: Record<string, string[]> = {
        all: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'],
        open: ['OPEN', 'REOPENED'],
        'in-progress': ['IN_PROGRESS'],
        ready: ['READY_FOR_QC'],
        closed: ['CLOSED'],
      }
      const statuses = statusFilter[statusParam] ?? statusFilter.all
      const priority = typeof query.priority === 'string' ? query.priority : undefined
      const tickets = await prisma.task.findMany({
        where: {
          projectId: selfProject.id,
          tags: { some: { tag: { name: AI_QUEUE_TAG } } },
          status: { in: statuses as never },
          ...(priority ? { priority: priority as never } : {}),
        },
        include: {
          reporter: { select: { id: true, name: true, email: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { evidence: true, comments: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      })
      return { tickets, selfProject }
    })

    .post('/api/qc/tickets', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 409
        return { error: 'No self-project configured. Super-admin must set one first.' }
      }
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: string
        route?: string
        evidenceUrls?: string[]
      }
      if (!body.title?.trim() || !body.description?.trim()) {
        set.status = 400
        return { error: 'title dan description wajib diisi' }
      }
      const tag = await ensureAiQueueTag(selfProject.id)
      const ticket = await prisma.task.create({
        data: {
          projectId: selfProject.id,
          kind: 'BUG',
          title: body.title.trim(),
          description: body.description.trim(),
          priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
          route: body.route ?? null,
          reporterId: auth.userId,
          tags: { create: [{ tagId: tag.id }] },
          evidence: body.evidenceUrls?.length
            ? { create: body.evidenceUrls.map((url) => ({ url, kind: 'LINK' as const })) }
            : undefined,
        },
      })
      audit(auth.userId, 'QC_TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
      appLog('info', `QC ticket created: ${ticket.title} by ${auth.email}`)
      emitInvalidate('qc')
      return { ticket }
    })

    .get('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 404
        return { error: 'No self-project configured' }
      }
      const ticket = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        include: {
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          tags: { include: { tag: true } },
          evidence: { orderBy: { createdAt: 'asc' } },
          comments: {
            include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
          checklist: { orderBy: { order: 'asc' } },
          statusChanges: {
            include: { author: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!ticket) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      return { ticket }
    })

    .patch('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 404
        return { error: 'No self-project configured' }
      }
      const existing = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, status: true },
      })
      if (!existing) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      const body = (await request.json()) as {
        title?: string
        description?: string
        priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
        status?: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
        route?: string | null
      }
      const data: Record<string, unknown> = {}
      if (body.title !== undefined) data.title = body.title
      if (body.description !== undefined) data.description = body.description
      if (body.priority !== undefined) data.priority = body.priority
      if (body.route !== undefined) data.route = body.route
      if (body.status !== undefined && body.status !== existing.status) {
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
      }
      const ticket = await prisma.task.update({ where: { id: params.id }, data })
      if (body.status !== undefined && body.status !== existing.status) {
        await prisma.taskStatusChange.create({
          data: { taskId: ticket.id, authorId: auth.userId, fromStatus: existing.status, toStatus: body.status },
        })
      }
      audit(auth.userId, 'QC_TICKET_UPDATED', `#${ticket.id}`, getIp(request))
      emitInvalidate('qc')
      return { ticket }
    })

    .post('/api/qc/tickets/:id/comments', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 404
        return { error: 'No self-project configured' }
      }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, title: true },
      })
      if (!exists) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      const body = (await request.json()) as { body?: string }
      if (!body.body?.trim()) {
        set.status = 400
        return { error: 'body wajib diisi' }
      }
      const comment = await prisma.taskComment.create({
        data: { taskId: params.id, authorId: auth.userId, authorTag: auth.role, body: body.body.trim() },
      })
      emitInvalidate('qc')
      return { comment }
    })

    .post('/api/qc/tickets/:id/evidence', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!['QC', 'ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 404
        return { error: 'No self-project configured' }
      }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true },
      })
      if (!exists) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      const body = (await request.json()) as { url?: string; note?: string }
      if (!body.url?.trim()) {
        set.status = 400
        return { error: 'url wajib diisi' }
      }
      const evidence = await prisma.taskEvidence.create({
        data: {
          taskId: params.id,
          url: body.url.trim(),
          kind: 'LINK',
          note: body.note ?? null,
        },
      })
      emitInvalidate('qc')
      return { evidence }
    })

    .delete('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'Hanya ADMIN / SUPER_ADMIN yang bisa menghapus ticket' }
      }
      const selfProject = await getSelfProject()
      if (!selfProject) {
        set.status = 404
        return { error: 'No self-project configured' }
      }
      const exists = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, title: true },
      })
      if (!exists) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      await prisma.task.delete({ where: { id: params.id } })
      audit(auth.userId, 'QC_TICKET_DELETED', `#${exists.id} "${exists.title}"`, getIp(request))
      appLog('info', `QC ticket deleted: #${exists.id} by ${auth.email}`)
      emitInvalidate('qc')
      return { ok: true }
    })
}
