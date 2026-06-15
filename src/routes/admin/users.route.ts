import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { extractSessionToken, getIp, isSystemAdmin, writeAuditLog } from '../../lib/route-helpers'

export function adminUsersRoutes() {
  return (
    new Elysia()

      .get('/api/admin/users', async ({ request, set }) => {
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
        const users = await prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
          orderBy: { createdAt: 'asc' },
        })
        return { users }
      })

      .put('/api/admin/users/:id/role', async ({ request, params, set }) => {
        const ip = getIp(request)
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        if (session.user.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa mengubah role sendiri' }
        }
        const { role } = (await request.json()) as { role: string }
        if (!['USER', 'QC', 'ADMIN'].includes(role)) {
          set.status = 400
          return { error: 'Role tidak valid (USER, QC, atau ADMIN)' }
        }
        const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true, role: true } })
        if (target?.role === 'SUPER_ADMIN') {
          set.status = 400
          return { error: 'Tidak bisa mengubah role SUPER_ADMIN' }
        }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { role: role as 'USER' | 'QC' | 'ADMIN' },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
        })
        writeAuditLog(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${session.user.id}`, ip)
        appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
        return { user }
      })

      .put('/api/admin/users/:id/block', async ({ request, params, set }) => {
        const ip = getIp(request)
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        if (session.user.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa memblokir diri sendiri' }
        }
        const { blocked } = (await request.json()) as { blocked: boolean }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { blocked },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true, image: true },
        })
        if (blocked) {
          await prisma.session.deleteMany({ where: { userId: params.id } })
        }
        const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
        writeAuditLog(params.id, action, `by ${session.user.id}`, ip)
        appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
        return { user }
      })
  )
}
