import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'

export function meNotificationsRoutes() {
  return new Elysia()

    .get('/api/me/notifications', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const limitRaw = Number(query?.limit ?? 50)
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
      const onlyUnread = query?.unread === '1' || query?.unread === 'true'
      const notifications = await prisma.notification.findMany({
        where: { recipientId: auth.userId, ...(onlyUnread ? { readAt: null } : {}) },
        include: { actor: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      const unreadCount = await prisma.notification.count({
        where: { recipientId: auth.userId, readAt: null },
      })
      return { notifications, unreadCount }
    })

    .get('/api/me/notifications/unread-count', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const unreadCount = await prisma.notification.count({
        where: { recipientId: auth.userId, readAt: null },
      })
      return { unreadCount }
    })

    .post('/api/me/notifications/:id/read', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const n = await prisma.notification.findUnique({ where: { id: params.id } })
      if (!n || n.recipientId !== auth.userId) {
        set.status = 404
        return { error: 'Notification not found' }
      }
      if (n.readAt) return { notification: n }
      const notification = await prisma.notification.update({
        where: { id: params.id },
        data: { readAt: new Date() },
      })
      return { notification }
    })

    .post('/api/me/notifications/read-all', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const result = await prisma.notification.updateMany({
        where: { recipientId: auth.userId, readAt: null },
        data: { readAt: new Date() },
      })
      return { updated: result.count }
    })

    .delete('/api/me/notifications/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const n = await prisma.notification.findUnique({ where: { id: params.id } })
      if (!n || n.recipientId !== auth.userId) {
        set.status = 404
        return { error: 'Notification not found' }
      }
      await prisma.notification.delete({ where: { id: params.id } })
      return { ok: true }
    })
}
