import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { getOnlineUserIds } from '../../lib/presence'
import { extractSessionToken, isSystemAdmin } from '../../lib/route-helpers'

export function adminSessionsRoutes() {
  return (
    new Elysia()

      .get('/api/admin/sessions', async ({ request, set }) => {
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
        if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const onlineIds = new Set(getOnlineUserIds())
        const sessions = await prisma.session.findMany({
          include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true, image: true } } },
          orderBy: { createdAt: 'desc' },
        })

        const now = new Date()
        const result = sessions.map((s) => ({
          id: s.id,
          userId: s.user.id,
          userName: s.user.name,
          userEmail: s.user.email,
          userRole: s.user.role,
          userBlocked: s.user.blocked,
          userImage: s.user.image ?? null,
          isOnline: onlineIds.has(s.user.id),
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          isExpired: s.expiresAt < now,
        }))

        const byRole: Record<string, number> = {}
        const uniqueUsers = new Set<string>()
        let active = 0, expired = 0
        for (const s of result) {
          uniqueUsers.add(s.userId)
          byRole[s.userRole] = (byRole[s.userRole] || 0) + 1
          if (s.isExpired) expired++
          else active++
        }

        return {
          sessions: result,
          summary: { totalSessions: result.length, activeSessions: active, expiredSessions: expired, onlineUsers: onlineIds.size, byRole },
        }
      })
  )
}
