import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { notifyTaskStatusChanged } from '../../lib/notifications'
import { emitInvalidate } from '../../lib/presence'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcActionRoutes() {
  return new Elysia()

    // Reviewer rejects a submitted fix: READY_FOR_QC → REOPENED with a mandatory
    // reason comment, atomically, so the ticket re-enters the ai-queue and the
    // reason is never lost. Fires notifyTaskStatusChanged to reporter+assignee.
    .post('/api/qc/tickets/:id/request-revision', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const ticket = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        select: { id: true, status: true, title: true, reporterId: true, assigneeId: true },
      })
      if (!ticket) { set.status = 404; return { error: 'Ticket not found' } }
      if (ticket.status !== 'READY_FOR_QC') {
        set.status = 400
        return { error: 'Minta Revisi hanya untuk ticket berstatus READY_FOR_QC' }
      }
      const body = (await request.json()) as { comment?: string }
      const reason = body.comment?.trim()
      if (!reason) { set.status = 400; return { error: 'comment wajib diisi (alasan revisi)' } }

      await prisma.$transaction([
        prisma.taskComment.create({
          data: { taskId: ticket.id, authorId: auth.userId, authorTag: auth.role, body: reason },
        }),
        prisma.task.update({ where: { id: ticket.id }, data: { status: 'REOPENED', closedAt: null } }),
        prisma.taskStatusChange.create({
          data: { taskId: ticket.id, authorId: auth.userId, fromStatus: 'READY_FOR_QC', toStatus: 'REOPENED' },
        }),
      ])
      const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
      notifyTaskStatusChanged({
        taskId: ticket.id,
        projectId: selfProject.id,
        taskTitle: ticket.title,
        reporterId: ticket.reporterId,
        assigneeId: ticket.assigneeId,
        actorId: auth.userId,
        actorName: actor?.name ?? 'Someone',
        fromStatus: 'READY_FOR_QC',
        toStatus: 'REOPENED',
      }).catch(() => {})
      writeAuditLog(auth.userId, 'QC_TICKET_REVISION_REQUESTED', `#${ticket.id}`, getIp(request))
      appLog('info', `QC revision requested: #${ticket.id} by ${auth.email}`)
      emitInvalidate('qc')
      return { ok: true, status: 'REOPENED' }
    })

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

    .post('/api/qc/tickets/:id/evidence/upload', async ({ request, params, set }) => {
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
      const form = await request.formData()
      const file = form.get('file')
      const note = form.get('note')
      if (!(file instanceof File)) { set.status = 400; return { error: 'file wajib diupload (field name: file)' } }
      if (file.size === 0) { set.status = 400; return { error: 'File kosong' } }
      if (file.size > env.UPLOAD_MAX_BYTES) {
        set.status = 413
        return { error: `File terlalu besar (max ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)} MB)` }
      }
      if (!file.type.startsWith('image/')) { set.status = 415; return { error: 'Hanya file gambar yang diizinkan' } }
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const safeDir = path.resolve(env.UPLOADS_DIR, 'evidence', params.id)
      await fs.mkdir(safeDir, { recursive: true })
      const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, '')
      const storedName = `${crypto.randomUUID()}${ext}`
      await Bun.write(path.join(safeDir, storedName), file)
      const displayNote = [
        file.name,
        `${(file.size / 1024).toFixed(1)} KB`,
        note && typeof note === 'string' ? note : null,
      ].filter(Boolean).join(' · ')
      const evidence = await prisma.taskEvidence.create({
        data: {
          taskId: params.id,
          kind: 'SCREENSHOT',
          url: `/api/evidence/${storedName}?task=${params.id}`,
          note: displayNote,
        },
      })
      writeAuditLog(auth.userId, 'EVIDENCE_UPLOADED', `ticket=${params.id} file=${file.name}`, getIp(request))
      emitInvalidate('qc')
      return { evidence }
    })
}
