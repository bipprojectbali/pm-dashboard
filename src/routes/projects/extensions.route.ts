import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { canManageProject, canReadProject, getIp, requireAuth, requireProjectMember } from '../../lib/route-helpers'
import { audit } from './shared'

export function projectExtensionRoutes() {
  return new Elysia()
    .post('/api/projects/:id/extend', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can extend deadline' }
      }
      const body = (await request.json()) as { newEndAt?: string; reason?: string }
      if (!body.newEndAt) { set.status = 400; return { error: 'newEndAt wajib diisi' } }
      const newEnd = new Date(body.newEndAt)
      if (Number.isNaN(newEnd.getTime())) { set.status = 400; return { error: 'newEndAt tidak valid' } }
      const existing = await prisma.project.findUnique({
        where: { id: params.id },
        select: { endsAt: true, originalEndAt: true, startsAt: true },
      })
      if (!existing) { set.status = 404; return { error: 'Project not found' } }
      if (existing.startsAt && newEnd < existing.startsAt) {
        set.status = 400
        return { error: 'newEndAt must be after startsAt' }
      }
      if (existing.endsAt && newEnd.getTime() === existing.endsAt.getTime()) {
        set.status = 400
        return { error: 'newEndAt sama dengan deadline saat ini' }
      }
      const [extension, project] = await prisma.$transaction([
        prisma.projectExtension.create({
          data: {
            projectId: params.id,
            extendedById: auth.userId,
            previousEndAt: existing.endsAt,
            newEndAt: newEnd,
            reason: body.reason?.trim() || null,
          },
          include: { extendedBy: { select: { id: true, name: true, email: true, image: true } } },
        }),
        prisma.project.update({
          where: { id: params.id },
          data: {
            endsAt: newEnd,
            originalEndAt: existing.originalEndAt ?? existing.endsAt ?? newEnd,
          },
        }),
      ])
      audit(
        auth.userId,
        'PROJECT_EXTENDED',
        `${params.id} ${existing.endsAt?.toISOString() ?? 'null'} → ${newEnd.toISOString()}${body.reason ? ` (${body.reason})` : ''}`,
        getIp(request),
      )
      emitInvalidate('projects', { projectId: params.id })
      return { extension, project }
    })

    .get('/api/projects/:id/extensions', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const extensions = await prisma.projectExtension.findMany({
        where: { projectId: params.id },
        include: { extendedBy: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { extensions }
    })
}
