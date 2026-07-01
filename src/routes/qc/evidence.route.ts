import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { putEvidence } from '../../lib/evidence-storage'
import { emitInvalidate } from '../../lib/presence'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcEvidenceRoutes() {
  return new Elysia()

    .post('/api/qc/tickets/:id/evidence', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!QC_ROLES.includes(auth.role as never)) {
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
        data: { taskId: params.id, url: body.url.trim(), kind: 'LINK', note: body.note ?? null },
      })
      emitInvalidate('qc')
      return { evidence }
    })

    .post('/api/qc/tickets/:id/evidence/upload', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!QC_ROLES.includes(auth.role as never)) {
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
      const form = await request.formData()
      const file = form.get('file')
      const note = form.get('note')
      if (!(file instanceof File)) {
        set.status = 400
        return { error: 'file wajib diupload (field name: file)' }
      }
      if (file.size === 0) {
        set.status = 400
        return { error: 'File kosong' }
      }
      if (file.size > env.UPLOAD_MAX_BYTES) {
        set.status = 413
        return { error: `File terlalu besar (max ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)} MB)` }
      }
      if (!file.type.startsWith('image/')) {
        set.status = 415
        return { error: 'Hanya file gambar yang diizinkan' }
      }
      const path = await import('node:path')
      const ext = path
        .extname(file.name)
        .slice(0, 12)
        .replace(/[^a-zA-Z0-9.]/g, '')
      const storedName = `${crypto.randomUUID()}${ext}`
      await putEvidence(params.id, storedName, file, file.type || undefined)
      const displayNote = [
        file.name,
        `${(file.size / 1024).toFixed(1)} KB`,
        note && typeof note === 'string' ? note : null,
      ]
        .filter(Boolean)
        .join(' · ')
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
