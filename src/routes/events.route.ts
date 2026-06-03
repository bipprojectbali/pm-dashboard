import Elysia from 'elysia'
import { prisma } from '../lib/db'
import { requireAuth, isSystemAdmin } from '../lib/route-helpers'

const eventInclude = {
  createdBy: { select: { id: true, name: true, email: true, image: true } },
  project: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const

export function eventsRoutes() {
  return new Elysia()
    // ── Event Tags CRUD ────────────────────────────────────────────────────────

    // GET /api/event-tags — list all team-wide event tags
    .get('/api/event-tags', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const tags = await prisma.eventTag.findMany({ orderBy: { name: 'asc' } })
      return { tags }
    })

    // POST /api/event-tags — create tag (any authenticated user)
    .post('/api/event-tags', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const body = (await request.json()) as { name?: string; color?: string }
      if (!body.name?.trim()) { set.status = 400; return { error: 'name wajib diisi' } }
      try {
        const tag = await prisma.eventTag.create({
          data: { name: body.name.trim(), color: body.color?.trim() || 'blue' },
        })
        return { tag }
      } catch {
        set.status = 409; return { error: 'Tag dengan nama tersebut sudah ada' }
      }
    })

    // PATCH /api/event-tags/:id — rename / recolor (admin)
    .patch('/api/event-tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!isSystemAdmin(auth.role)) { set.status = 403; return { error: 'Hanya admin yang bisa mengedit tag' } }
      const body = (await request.json()) as { name?: string; color?: string }
      const data: Record<string, string> = {}
      if (body.name?.trim()) data.name = body.name.trim()
      if (body.color?.trim()) data.color = body.color.trim()
      if (!Object.keys(data).length) { set.status = 400; return { error: 'Tidak ada perubahan' } }
      try {
        const tag = await prisma.eventTag.update({ where: { id: params.id }, data })
        return { tag }
      } catch {
        set.status = 409; return { error: 'Nama tag sudah dipakai' }
      }
    })

    // DELETE /api/event-tags/:id — delete tag (admin)
    .delete('/api/event-tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!isSystemAdmin(auth.role)) { set.status = 403; return { error: 'Hanya admin yang bisa menghapus tag' } }
      await prisma.eventTag.delete({ where: { id: params.id } }).catch(() => {})
      return { ok: true }
    })

    // ── Events CRUD ────────────────────────────────────────────────────────────

    // GET /api/events/:id
    .get('/api/events/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const event = await prisma.event.findUnique({
        where: { id: params.id },
        include: eventInclude,
      })
      if (!event) { set.status = 404; return { error: 'Event tidak ditemukan' } }
      return { event }
    })

    // GET /api/events
    .get('/api/events', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }

      const limit = Math.min(Number(query.limit) || 50, 200)
      const offset = Number(query.offset) || 0
      const upcoming = query.upcoming === 'true'
      const tagId = typeof query.tagId === 'string' ? query.tagId : undefined

      const where: Record<string, unknown> = {}
      if (upcoming) where.startsAt = { gte: new Date() }
      if (tagId) where.tags = { some: { tagId } }

      const events = await prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        take: limit,
        skip: offset,
        include: eventInclude,
      })

      return { count: events.length, events }
    })

    // POST /api/events
    .post('/api/events', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }

      const body = (await request.json()) as {
        title?: string; description?: string; startsAt?: string; endsAt?: string
        location?: string; projectId?: string; tagIds?: string[]
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
          tags: body.tagIds?.length
            ? { create: body.tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
        include: eventInclude,
      })

      return { event }
    })

    // PATCH /api/events/:id
    .patch('/api/events/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }

      const existing = await prisma.event.findUnique({ where: { id: params.id } })
      if (!existing) { set.status = 404; return { error: 'Event tidak ditemukan' } }

      const isAdmin = isSystemAdmin(auth.role)
      const isCreator = existing.createdById === auth.userId
      if (!isAdmin && !isCreator) { set.status = 403; return { error: 'Hanya kreator atau admin yang bisa mengedit' } }

      const body = (await request.json()) as {
        title?: string; description?: string; startsAt?: string; endsAt?: string | null
        location?: string; projectId?: string | null; tagIds?: string[]
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

      // Replace tag set if tagIds provided
      if (body.tagIds !== undefined) {
        await prisma.eventTagLink.deleteMany({ where: { eventId: params.id } })
        if (body.tagIds.length) {
          await prisma.eventTagLink.createMany({
            data: body.tagIds.map((tagId) => ({ eventId: params.id, tagId })),
            skipDuplicates: true,
          })
        }
      }

      const event = await prisma.event.update({
        where: { id: params.id },
        data,
        include: eventInclude,
      })

      return { event }
    })

    // DELETE /api/events/:id
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
