import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { addConnection, getOnlineUserIds, removeConnection } from '../../lib/presence'
import { extractSessionToken } from '../../lib/route-helpers'

export function adminPresenceRoutes() {
  return (
    new Elysia()

      .ws('/ws/presence', {
        async open(ws) {
          const cookie = ws.data.headers?.cookie ?? ''
          // Shared helper decodes the URL-encoded cookie and strips the Better Auth
          // `.signature` suffix. A hand-rolled `match(/session=.../)` sends the raw
          // value to the DB lookup, misses, and closes the socket 4001 — a reconnect
          // storm that also left the "Online" count stuck at 0.
          const token = extractSessionToken(cookie as string)
          if (!token) {
            ws.close(4001, 'Unauthorized')
            return
          }
          const session = await prisma.session.findUnique({
            where: { token },
            include: { user: { select: { id: true, role: true } } },
          })
          if (!session || session.expiresAt < new Date()) {
            ws.close(4001, 'Unauthorized')
            return
          }
          const isAdmin = session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN'
          ;(ws.data as unknown as { userId: string }).userId = session.user.id
          addConnection(ws as any, session.user.id, isAdmin)
        },
        close(ws) {
          removeConnection(ws as any)
        },
        message() {
          // No client messages expected
        },
      })

      .get('/api/admin/presence', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        return { online: getOnlineUserIds() }
      })
  )
}
