import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'
import { eventInclude } from './shared'

export function eventQueryRoutes() {
  return new Elysia()

    .get('/api/events/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const event = await prisma.event.findUnique({ where: { id: params.id }, include: eventInclude })
      if (!event) { set.status = 404; return { error: 'Event tidak ditemukan' } }
      return { event }
    })

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
}
