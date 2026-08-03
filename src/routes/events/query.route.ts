import { Elysia } from 'elysia'
import { computeEventBadgeStats } from '../../lib/event-badge-stats'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'
import { eventInclude } from './shared'

export function eventQueryRoutes() {
  return new Elysia()

    // Registered before /api/events/:id so "badge-stats" is never captured by
    // the :id param.
    .get('/api/events/badge-stats', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      return computeEventBadgeStats()
    })

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
      const [events, total] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: { startsAt: 'asc' },
          take: limit,
          skip: offset,
          include: eventInclude,
        }),
        prisma.event.count({ where }),
      ])
      // `count` = the true total matching `where` (un-capped), not events.length —
      // the old behavior silently misreported page size as a total once a query
      // matched more than `limit` rows (see badge-stats endpoint for the derived
      // today/thisWeek counts that consumers actually need).
      return { count: total, events }
    })
}
