import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import {
  canGrantProjectOwner,
  canManageProject,
  getIp,
  requireAuth,
  requireProjectMember,
} from '../../lib/route-helpers'
import { audit } from './shared'

export function projectMemberRoutes() {
  return new Elysia()
    .post('/api/projects/:id/members', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can add members' }
      }
      const body = (await request.json()) as { userId?: string; role?: string }
      if (!body.userId) { set.status = 400; return { error: 'userId wajib diisi' } }
      const role = (body.role ?? 'MEMBER') as 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'
      if (role === 'OWNER' && !canGrantProjectOwner(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER or SUPER_ADMIN can grant OWNER role' }
      }
      const existingMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: params.id, userId: body.userId } },
      })
      if (existingMember) { set.status = 409; return { error: 'User is already a member of this project' } }
      const member = await prisma.projectMember.create({
        data: { projectId: params.id, userId: body.userId, role },
        include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_ADDED', `${params.id} ← ${body.userId} (${role})`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { member }
    })

    .patch('/api/projects/:id/members/:userId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can change member role' }
      }
      const body = (await request.json()) as { role?: string }
      const role = body.role as 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' | undefined
      if (!role || !['OWNER', 'PM', 'MEMBER', 'VIEWER'].includes(role)) {
        set.status = 400
        return { error: 'role wajib diisi (OWNER|PM|MEMBER|VIEWER)' }
      }
      if (role === 'OWNER' && !canGrantProjectOwner(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER or SUPER_ADMIN can grant OWNER role' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true } })
      if (project?.ownerId === params.userId && role !== 'OWNER') {
        set.status = 400
        return { error: 'Cannot demote the project owner' }
      }
      const updated = await prisma.projectMember.update({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
        data: { role },
        include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_ROLE_CHANGED', `${params.id} ${params.userId} → ${role}`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { member: updated }
    })

    .delete('/api/projects/:id/members/:userId', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      if (!canManageProject(auth, membership)) {
        set.status = 403
        return { error: 'Only OWNER, PM, or system admin can remove members' }
      }
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true } })
      if (project?.ownerId === params.userId) { set.status = 400; return { error: 'Cannot remove the project owner' } }
      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
      })
      audit(auth.userId, 'PROJECT_MEMBER_REMOVED', `${params.id} ← ${params.userId}`, getIp(request))
      emitInvalidate('projects', { projectId: params.id })
      return { ok: true }
    })
}
