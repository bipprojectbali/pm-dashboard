import { Elysia } from 'elysia'
import { prisma } from '../lib/db'
import { requireAuth } from '../lib/route-helpers'

export function activityRoutes() {
  return new Elysia()

    // ─── Activity (pm-watch user-facing) ──────────────
    .get('/api/activity/agents', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN'
      const scopeUserId = isAdmin && query.userId ? String(query.userId) : auth.userId
      const agents = await prisma.agent.findMany({
        where: { claimedById: scopeUserId, status: 'APPROVED' },
        select: {
          id: true,
          agentId: true,
          hostname: true,
          osUser: true,
          lastSeenAt: true,
          claimedBy: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { events: true } },
        },
        orderBy: { lastSeenAt: 'desc' },
      })
      let availableUsers:
        | Array<{ id: string; name: string; email: string; agentCount: number; eventCount: number }>
        | undefined
      if (isAdmin) {
        const grouped = await prisma.agent.groupBy({
          by: ['claimedById'],
          where: { status: 'APPROVED', claimedById: { not: null } },
          _count: { _all: true },
        })
        const userIds = grouped.map((g) => g.claimedById).filter((v): v is string => !!v)
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, image: true },
        })
        const eventCounts = await prisma.activityEvent.groupBy({
          by: ['agentId'],
          _count: { _all: true },
        })
        const agentUserMap = await prisma.agent.findMany({
          where: { claimedById: { in: userIds } },
          select: { id: true, claimedById: true },
        })
        const eventByUser = new Map<string, number>()
        for (const ec of eventCounts) {
          const au = agentUserMap.find((a) => a.id === ec.agentId)
          if (au?.claimedById) {
            eventByUser.set(au.claimedById, (eventByUser.get(au.claimedById) ?? 0) + ec._count._all)
          }
        }
        availableUsers = users.map((u) => ({
          ...u,
          agentCount: grouped.find((g) => g.claimedById === u.id)?._count._all ?? 0,
          eventCount: eventByUser.get(u.id) ?? 0,
        }))
      }
      return { agents, scopeUserId, availableUsers }
    })

    .get('/api/activity', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN'
      const scopeUserId = isAdmin && query.userId ? String(query.userId) : auth.userId
      const myAgents = await prisma.agent.findMany({
        where: { claimedById: scopeUserId, status: 'APPROVED' },
        select: { id: true },
      })
      const agentIds = myAgents.map((a) => a.id)
      if (agentIds.length === 0) return { events: [], count: 0 }

      const where: Record<string, unknown> = { agentId: { in: agentIds } }
      if (query.agentId && agentIds.includes(String(query.agentId))) where.agentId = String(query.agentId)
      if (query.bucketId) where.bucketId = String(query.bucketId)
      const ts: Record<string, Date> = {}
      if (query.from) ts.gte = new Date(String(query.from))
      if (query.to) ts.lte = new Date(String(query.to))
      if (Object.keys(ts).length > 0) where.timestamp = ts

      const limit = Math.min(Number(query.limit ?? 200), 1000)
      const events = await prisma.activityEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: { agent: { select: { hostname: true, osUser: true } } },
      })
      return { events, count: events.length, limit }
    })

    .get('/api/activity/calendar', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN'
      const scopeUserId = isAdmin && query.userId ? String(query.userId) : auth.userId
      const monthStr = typeof query.month === 'string' ? query.month : ''
      const match = monthStr.match(/^(\d{4})-(\d{2})$/)
      const now = new Date()
      const year = match ? Number(match[1]) : now.getFullYear()
      const month = match ? Number(match[2]) - 1 : now.getMonth()
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 1)

      const myAgents = await prisma.agent.findMany({
        where: { claimedById: scopeUserId, status: 'APPROVED' },
        select: { id: true },
      })
      const agentIds = myAgents.map((a) => a.id)
      if (agentIds.length === 0) {
        return { month: `${year}-${String(month + 1).padStart(2, '0')}`, days: {} }
      }

      const rows = await prisma.$queryRaw<Array<{ day: Date; count: bigint; duration: number }>>`
        SELECT DATE_TRUNC('day', timestamp) AS day,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(duration), 0)::float8 AS duration
        FROM activity_event
        WHERE "agentId" = ANY (${agentIds})
          AND timestamp >= ${start}
          AND timestamp < ${end}
        GROUP BY day
        ORDER BY day ASC
      `
      const days: Record<string, { count: number; durationSec: number }> = {}
      for (const r of rows) {
        const d = new Date(r.day)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        days[key] = { count: Number(r.count), durationSec: r.duration }
      }
      return { month: `${year}-${String(month + 1).padStart(2, '0')}`, days }
    })

    .get('/api/activity/heatmap', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN'
      const scopeUserId = isAdmin && query.userId ? String(query.userId) : auth.userId
      const yearStr = typeof query.year === 'string' ? query.year : ''
      const match = yearStr.match(/^\d{4}$/)
      const now = new Date()
      const year = match ? Number(yearStr) : now.getFullYear()
      const start = new Date(year, 0, 1)
      const end = new Date(year + 1, 0, 1)

      const myAgents = await prisma.agent.findMany({
        where: { claimedById: scopeUserId, status: 'APPROVED' },
        select: { id: true },
      })
      const agentIds = myAgents.map((a) => a.id)
      if (agentIds.length === 0) {
        return { year, days: {} }
      }

      const rows = await prisma.$queryRaw<Array<{ day: Date; count: bigint; duration: number }>>`
        SELECT DATE_TRUNC('day', timestamp) AS day,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(duration), 0)::float8 AS duration
        FROM activity_event
        WHERE "agentId" = ANY (${agentIds})
          AND timestamp >= ${start}
          AND timestamp < ${end}
        GROUP BY day
        ORDER BY day ASC
      `
      const days: Record<string, { count: number; durationSec: number }> = {}
      for (const r of rows) {
        const d = new Date(r.day)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        days[key] = { count: Number(r.count), durationSec: r.duration }
      }
      return { year, days }
    })

    .get('/api/activity/summary', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const isAdmin = auth.role === 'ADMIN' || auth.role === 'SUPER_ADMIN'
      const scopeUserId = isAdmin && query.userId ? String(query.userId) : auth.userId
      const myAgents = await prisma.agent.findMany({
        where: { claimedById: scopeUserId, status: 'APPROVED' },
        select: { id: true },
      })
      const agentIds = myAgents.map((a) => a.id)
      if (agentIds.length === 0) {
        return {
          today: { count: 0, durationSec: 0 },
          week: { count: 0, durationSec: 0 },
          topApps: [],
          topTitles: [],
          byBucket: [],
        }
      }

      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const windowStart = query.from ? new Date(String(query.from)) : weekAgo
      const windowEnd = query.to ? new Date(String(query.to)) : now

      const [todayAgg, weekAgg, bucketAgg, windowEvents] = await Promise.all([
        prisma.activityEvent.aggregate({
          where: { agentId: { in: agentIds }, timestamp: { gte: startOfDay } },
          _sum: { duration: true },
          _count: { _all: true },
        }),
        prisma.activityEvent.aggregate({
          where: { agentId: { in: agentIds }, timestamp: { gte: weekAgo } },
          _sum: { duration: true },
          _count: { _all: true },
        }),
        prisma.activityEvent.groupBy({
          by: ['bucketId'],
          where: { agentId: { in: agentIds }, timestamp: { gte: windowStart, lte: windowEnd } },
          _sum: { duration: true },
          _count: { _all: true },
        }),
        prisma.activityEvent.findMany({
          where: { agentId: { in: agentIds }, timestamp: { gte: windowStart, lte: windowEnd } },
          select: { duration: true, data: true, bucketId: true },
          take: 5000,
        }),
      ])

      const appTotals = new Map<string, { durationSec: number; count: number }>()
      const titleTotals = new Map<string, { durationSec: number; count: number; app: string }>()
      for (const e of windowEvents) {
        const d = (e.data ?? {}) as Record<string, unknown>
        const app = typeof d.app === 'string' ? d.app : null
        const title = typeof d.title === 'string' ? d.title : null
        if (app) {
          const cur = appTotals.get(app) ?? { durationSec: 0, count: 0 }
          cur.durationSec += e.duration
          cur.count += 1
          appTotals.set(app, cur)
        }
        if (app && title) {
          const key = `${app} :: ${title}`
          const cur = titleTotals.get(key) ?? { durationSec: 0, count: 0, app }
          cur.durationSec += e.duration
          cur.count += 1
          titleTotals.set(key, cur)
        }
      }
      const topApps = [...appTotals.entries()]
        .map(([app, v]) => ({ app, durationSec: v.durationSec, count: v.count }))
        .sort((a, b) => b.durationSec - a.durationSec)
        .slice(0, 10)
      const topTitles = [...titleTotals.entries()]
        .map(([key, v]) => ({
          key,
          app: v.app,
          title: key.slice(v.app.length + 4),
          durationSec: v.durationSec,
          count: v.count,
        }))
        .sort((a, b) => b.durationSec - a.durationSec)
        .slice(0, 10)
      const byBucket = bucketAgg
        .map((b) => ({ bucketId: b.bucketId, durationSec: b._sum.duration ?? 0, count: b._count._all }))
        .sort((a, b) => b.durationSec - a.durationSec)

      return {
        today: { count: todayAgg._count._all, durationSec: todayAgg._sum.duration ?? 0 },
        week: { count: weekAgg._count._all, durationSec: weekAgg._sum.duration ?? 0 },
        window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
        topApps,
        topTitles,
        byBucket,
      }
    })
}
