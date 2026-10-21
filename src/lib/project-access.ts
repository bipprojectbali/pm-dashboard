// Project authorization: role predicates + membership/read-access resolution.
import { prisma } from './db'
import { resolveLockState } from './project-lock'

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

// Real membership role, ignoring the overdue lock. Only for the paths that must
// keep working while locked: extending the deadline (otherwise the owner who is
// meant to unlock the project is locked out of unlocking it) and reading the
// project's access tokens.
export async function requireProjectMemberRaw(
  projectId: string,
  userId: string,
): Promise<{ role: ProjectRole } | null> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return m
}

// Effective membership role. A locked project reports every member as VIEWER,
// which every existing write gate already rejects — that is what enforces the
// lock, so no separate guard exists. Reads only test membership for null, so
// they are unaffected. System admins bypass the role check in their callers and
// stay able to act.
export async function requireProjectMember(projectId: string, userId: string): Promise<{ role: ProjectRole } | null> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: {
      role: true,
      project: { select: { endsAt: true, status: true, archivedAt: true } },
    },
  })
  if (!m) return null
  const lock = await resolveLockState(m.project)
  return { role: lock.locked ? 'VIEWER' : m.role }
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
