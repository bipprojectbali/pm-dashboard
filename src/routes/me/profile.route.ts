import path from 'node:path'
import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { env } from '../../lib/env'
import { getAvatar, putAvatar, removeAvatar } from '../../lib/evidence-storage'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'

const MAX_NAME_LENGTH = 100

export function meProfileRoutes() {
  return new Elysia()

    .put('/api/me/profile', async ({ request, body, set }) => {
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

    .post('/api/me/avatar', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        set.status = 400
        return { error: 'file wajib diupload (field name: file)' }
      }
      if (file.size === 0) {
        set.status = 400
        return { error: 'File kosong' }
      }
      if (file.size > env.UPLOAD_MAX_BYTES) {
        set.status = 413
        return { error: `File terlalu besar (max ${env.UPLOAD_MAX_BYTES} bytes)` }
      }
      if (!file.type.startsWith('image/')) {
        set.status = 400
        return { error: 'File harus berupa gambar' }
      }
      const ext = path
        .extname(file.name)
        .slice(0, 12)
        .replace(/[^a-zA-Z0-9.]/g, '')
      const storedName = `${crypto.randomUUID()}${ext}`
      await putAvatar(auth.userId, storedName, file, file.type)
      const image = `/api/me/avatar/${storedName}`
      const updated = await prisma.user.update({
        where: { id: auth.userId },
        data: { image },
        select: { image: true },
      })
      writeAuditLog(auth.userId, 'AVATAR_UPDATED', `file=${file.name} size=${file.size}`, getIp(request))
      return { user: updated }
    })

    .get('/api/me/avatar/:file', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const safeName = params.file.replace(/[^a-zA-Z0-9._-]/g, '')
      try {
        const bytes = await getAvatar(auth.userId, safeName).bytes()
        return new Response(bytes)
      } catch {
        set.status = 404
        return { error: 'File not found' }
      }
    })

    .delete('/api/me/avatar', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { image: true } })
      const match = user?.image?.match(/^\/api\/me\/avatar\/([^?]+)/)
      if (match) await removeAvatar(auth.userId, match[1])
      const updated = await prisma.user.update({
        where: { id: auth.userId },
        data: { image: null },
        select: { image: true },
      })
      writeAuditLog(auth.userId, 'AVATAR_REMOVED', null, getIp(request))
      return { user: updated }
    })
}
