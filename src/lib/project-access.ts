// Project authorization: role predicates + membership/read-access resolution.
import { prisma } from './db'

export type ProjectRole = 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'

export function isSystemAdmin(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function canManageProject(authCtx: { role: string }, membership: { role: ProjectRole } | null): boolean {
  if (isSystemAdmin(authCtx.role)) return true
  return membership?.role === 'OWNER' || membership?.role === 'PM'
}

export function canGrantProjectOwner(authCtx: { role: string }, membership: { role: ProjectRole } | null): boolean {
  if (authCtx.role === 'SUPER_ADMIN') return true
  return membership?.role === 'OWNER'
}

export async function requireProjectMember(projectId: string, userId: string): Promise<{ role: ProjectRole } | null> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return m
}

export async function canReadProject(
  projectId: string,
  authCtx: { userId: string; role: string },
): Promise<{ ok: boolean; status: 403 | 404 | null; membership: { role: ProjectRole } | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { visibility: true },
  })
  if (!project) return { ok: false, status: 404, membership: null }
  const membership = await requireProjectMember(projectId, authCtx.userId)
  const admin = isSystemAdmin(authCtx.role)
  const isVisible = admin || membership != null || project.visibility === 'INTERNAL' || project.visibility === 'PUBLIC'
  if (!isVisible) return { ok: false, status: 403, membership }
  return { ok: true, status: null, membership }
}
