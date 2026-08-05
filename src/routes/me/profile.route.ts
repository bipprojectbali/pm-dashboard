import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'

const MAX_NAME_LENGTH = 100

export function meProfileRoutes() {
  return new Elysia().put('/api/me/profile', async ({ request, body, set }) => {
    const auth = await requireAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const { name } = (body ?? {}) as { name?: string }
    const trimmed = name?.trim() ?? ''
    if (!trimmed) {
      set.status = 400
      return { error: 'Nama tidak boleh kosong' }
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      set.status = 400
      return { error: `Nama maksimal ${MAX_NAME_LENGTH} karakter` }
    }
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { name: trimmed },
      select: { name: true },
    })
    writeAuditLog(auth.userId, 'PROFILE_UPDATED', `name -> ${trimmed}`, getIp(request))
    return { user: updated }
  })
}
