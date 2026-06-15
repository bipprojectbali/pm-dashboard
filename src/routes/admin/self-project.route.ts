import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { clearSelfProject, getSelfProject, setSelfProject } from '../../lib/self-project'

export function adminSelfProjectRoutes() {
  return (
    new Elysia()

      .get('/api/admin/self-project', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const selfProject = await getSelfProject()
        return { selfProject }
      })

      .put('/api/admin/self-project', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const body = (await request.json()) as { projectId?: string }
        if (!body.projectId) {
          set.status = 400
          return { error: 'projectId wajib diisi' }
        }
        const exists = await prisma.project.findUnique({
          where: { id: body.projectId },
          select: { id: true, name: true },
        })
        if (!exists) {
          set.status = 404
          return { error: 'Project not found' }
        }
        const selfProject = await setSelfProject(body.projectId)
        writeAuditLog(auth.userId, 'SELF_PROJECT_SET', `${selfProject.name} (${selfProject.id})`, getIp(request))
        appLog('info', `Self-project set: ${selfProject.name} by ${auth.email}`)
        return { selfProject }
      })

      .delete('/api/admin/self-project', async ({ request, set }) => {
        const auth = await requireAuth(request)
        if (!auth) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        if (auth.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        await clearSelfProject()
        writeAuditLog(auth.userId, 'SELF_PROJECT_CLEARED', 'none', getIp(request))
        appLog('info', `Self-project cleared by ${auth.email}`)
        return { ok: true }
      })
  )
}
