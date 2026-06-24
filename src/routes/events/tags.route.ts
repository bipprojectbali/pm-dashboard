import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function eventTagsRoutes() {
  return new Elysia()

    .get('/api/event-tags', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const tags = await prisma.eventTag.findMany({ orderBy: { name: 'asc' } })
      return { tags }
    })

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
        set.status = 409
        return { error: 'Tag dengan nama tersebut sudah ada' }
      }
    })

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
        set.status = 409
        return { error: 'Nama tag sudah dipakai' }
      }
    })

    .delete('/api/event-tags/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!isSystemAdmin(auth.role)) { set.status = 403; return { error: 'Hanya admin yang bisa menghapus tag' } }
      await prisma.eventTag.delete({ where: { id: params.id } }).catch(() => {})
      return { ok: true }
    })
}
