import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { emitInvalidate } from '../../lib/presence'
import { getIp, isSystemAdmin, requireAuth, requireProjectMember, writeAuditLog } from '../../lib/route-helpers'

export function taskEvidenceRoutes() {
  return new Elysia()
    .post('/api/tasks/:id/evidence', async ({ request, params, set }) => {
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
      const body = (await request.json()) as { kind?: string; url?: string; note?: string }
      if (!body.kind || !body.url) {
        set.status = 400
        return { error: 'kind dan url wajib diisi' }
      }
      const evidence = await prisma.taskEvidence.create({
        data: { taskId: params.id, kind: body.kind, url: body.url, note: body.note ?? null },
      })
      emitInvalidate('tasks', { projectId: task.projectId })
      return { evidence }
    })

    .post('/api/tasks/:id/evidence/upload', async ({ request, params, set }) => {
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
        return { error: `File terlalu besar (max ${env.UPLOAD_MAX_BYTES} bytes)` }
      }
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const safeDir = path.resolve(env.UPLOADS_DIR, 'evidence', params.id)
      await fs.mkdir(safeDir, { recursive: true })
      const ext = path
        .extname(file.name)
        .slice(0, 12)
        .replace(/[^a-zA-Z0-9.]/g, '')
      const storedName = `${crypto.randomUUID()}${ext}`
      const fullPath = path.join(safeDir, storedName)
      await Bun.write(fullPath, file)
      const mimeKind = file.type.startsWith('image/')
        ? 'SCREENSHOT'
        : file.type.startsWith('text/') || file.type === 'application/json'
          ? 'LOG'
          : 'FILE'
      const displayNote = [
        file.name,
        `${(file.size / 1024).toFixed(1)} KB`,
        file.type || 'unknown',
        note && typeof note === 'string' ? note : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const evidence = await prisma.taskEvidence.create({
        data: {
          taskId: params.id,
          kind: mimeKind,
          url: `/api/evidence/${storedName}?task=${params.id}`,
          note: displayNote,
        },
      })
      writeAuditLog(
        auth.userId,
        'EVIDENCE_UPLOADED',
        `task=${params.id} file=${file.name} size=${file.size}`,
        getIp(request),
      )
      emitInvalidate('tasks', { projectId: task.projectId })
      return { evidence }
    })

    .get('/api/evidence/:file', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const taskId = typeof query?.task === 'string' ? query.task : null
      if (!taskId) {
        set.status = 400
        return { error: 'task param wajib' }
      }
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
      if (!task) {
        set.status = 404
        return { error: 'Task not found' }
      }
      const membership = await requireProjectMember(task.projectId, auth.userId)
      if (!membership && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Not a project member' }
      }
      const path = await import('node:path')
      const safeName = params.file.replace(/[^a-zA-Z0-9._-]/g, '')
      const fullPath = path.resolve(env.UPLOADS_DIR, 'evidence', taskId, safeName)
      const rootDir = path.resolve(env.UPLOADS_DIR, 'evidence', taskId)
      if (!fullPath.startsWith(rootDir)) {
        set.status = 400
        return { error: 'Invalid path' }
      }
      const file = Bun.file(fullPath)
      if (!(await file.exists())) {
        set.status = 404
        return { error: 'File not found' }
      }
      return new Response(file)
    })
}
