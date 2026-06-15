import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { canReadProject, getIp, requireAuth, requireProjectMember, writeAuditLog } from '../../lib/route-helpers'

export function taskTagsRoutes() {
  return new Elysia()
    .get('/api/projects/:id/tags', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const tags = await prisma.tag.findMany({ where: { projectId: params.id }, orderBy: { name: 'asc' } })
      return { tags }
    })

    .post('/api/projects/:id/tags', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      const body = (await request.json()) as { name?: string; color?: string }
      if (!body.name?.trim()) {
        set.status = 400
        return { error: 'name wajib diisi' }
      }
      const tag = await prisma.tag
        .create({ data: { projectId: params.id, name: body.name.trim(), color: body.color ?? 'blue' } })
        .catch((e: unknown) => {
          if ((e as { code?: string }).code === 'P2002') return null
          throw e
        })
      if (!tag) {
        set.status = 409
        return { error: 'Tag with that name already exists' }
      }
      writeAuditLog(auth.userId, 'TAG_CREATED', `${params.id} ← ${tag.name}`, getIp(request))
      emitInvalidate('tags', { projectId: params.id })
      return { tag }
    })

    .patch('/api/tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const tag = await prisma.tag.findUnique({ where: { id: params.id } })
      if (!tag) {
        set.status = 404
        return { error: 'Tag not found' }
      }
      const membership = await requireProjectMember(tag.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      const body = (await request.json()) as { name?: string; color?: string }
      const data: Record<string, unknown> = {}
      if (body.name !== undefined) data.name = body.name.trim()
      if (body.color !== undefined) data.color = body.color
      const updated = await prisma.tag.update({ where: { id: params.id }, data })
      emitInvalidate('tags', { projectId: tag.projectId })
      return { tag: updated }
    })

    .delete('/api/tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const tag = await prisma.tag.findUnique({ where: { id: params.id } })
      if (!tag) {
        set.status = 404
        return { error: 'Tag not found' }
      }
      const membership = await requireProjectMember(tag.projectId, auth.userId)
      if (!membership || membership.role === 'VIEWER') {
        set.status = 403
        return { error: 'Not a writable project member' }
      }
      await prisma.tag.delete({ where: { id: params.id } })
      writeAuditLog(auth.userId, 'TAG_DELETED', `${tag.projectId} ← ${tag.name}`, getIp(request))
      emitInvalidate('tags', { projectId: tag.projectId })
      emitInvalidate('tasks', { projectId: tag.projectId })
      return { ok: true }
    })
}
