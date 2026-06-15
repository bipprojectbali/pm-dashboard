import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'
import { eventInclude } from './shared'

export function eventWriteRoutes() {
  return new Elysia()

    .post('/api/events', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const body = (await request.json()) as {
        title?: string
        description?: string
        startsAt?: string
        endsAt?: string
        location?: string
        projectId?: string
        tagIds?: string[]
      }
      if (!body.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
      if (!body.startsAt) { set.status = 400; return { error: 'startsAt wajib diisi' } }
      const startsAt = new Date(body.startsAt)
      if (Number.isNaN(startsAt.getTime())) { set.status = 400; return { error: 'startsAt tidak valid' } }
      const endsAt = body.endsAt ? new Date(body.endsAt) : undefined
      if (endsAt && Number.isNaN(endsAt.getTime())) { set.status = 400; return { error: 'endsAt tidak valid' } }
      if (body.projectId) {
        const p = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
        if (!p) { set.status = 400; return { error: 'Project tidak ditemukan' } }
      }
      const event = await prisma.event.create({
        data: {
          title: body.title.trim(),
          description: body.description?.trim() || null,
          startsAt,
          endsAt: endsAt ?? null,
          location: body.location?.trim() || null,
          projectId: body.projectId || null,
          createdById: auth.userId,
          tags: body.tagIds?.length ? { create: body.tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
        include: eventInclude,
      })
      return { event }
    })

    .patch('/api/events/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const existing = await prisma.event.findUnique({ where: { id: params.id } })
      if (!existing) { set.status = 404; return { error: 'Event tidak ditemukan' } }
      const isAdmin = isSystemAdmin(auth.role)
      const isCreator = existing.createdById === auth.userId
      if (!isAdmin && !isCreator) { set.status = 403; return { error: 'Hanya kreator atau admin yang bisa mengedit' } }
      const body = (await request.json()) as {
        title?: string
        description?: string
        startsAt?: string
        endsAt?: string | null
        location?: string
        projectId?: string | null
        tagIds?: string[]
      }
      const data: Record<string, unknown> = { updatedAt: new Date() }
      if (body.title !== undefined) {
        if (!body.title.trim()) { set.status = 400; return { error: 'title tidak boleh kosong' } }
        data.title = body.title.trim()
      }
      if (body.description !== undefined) data.description = body.description?.trim() || null
      if (body.location !== undefined) data.location = body.location?.trim() || null
      if (body.projectId !== undefined) data.projectId = body.projectId || null
      if (body.startsAt !== undefined) {
        const d = new Date(body.startsAt)
        if (Number.isNaN(d.getTime())) { set.status = 400; return { error: 'startsAt tidak valid' } }
        data.startsAt = d
      }
      if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null
      if (body.tagIds !== undefined) {
        await prisma.eventTagLink.deleteMany({ where: { eventId: params.id } })
        if (body.tagIds.length) {
          await prisma.eventTagLink.createMany({
            data: body.tagIds.map((tagId) => ({ eventId: params.id, tagId })),
            skipDuplicates: true,
          })
        }
      }
      const event = await prisma.event.update({ where: { id: params.id }, data, include: eventInclude })
      return { event }
    })

    .delete('/api/events/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const existing = await prisma.event.findUnique({ where: { id: params.id } })
      if (!existing) { set.status = 404; return { error: 'Event tidak ditemukan' } }
      const isAdmin = isSystemAdmin(auth.role)
      const isCreator = existing.createdById === auth.userId
      if (!isAdmin && !isCreator) { set.status = 403; return { error: 'Hanya kreator atau admin yang bisa menghapus' } }
      await prisma.event.delete({ where: { id: params.id } })
      return { ok: true }
    })
}
