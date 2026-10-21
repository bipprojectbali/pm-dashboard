// Project authorization: role predicates + membership/read-access resolution.
import { prisma } from './db'
import { type LockState, resolveLockState } from './project-lock'

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
// meant to unlock the project is locked out of unlocking it), reading the
// project's access tokens, and telling an OWNER/PM apart from a plain member in
// canReadProject — requireProjectMember reports both as VIEWER, which would
// collapse the decision carve-out into the blanket denial.
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
// lock for writes, so no separate write guard exists. Reads are gated separately
// in canReadProject, which denies locked projects outright. System admins bypass
// the role check in their callers and stay able to act.
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

// The subset of the project every read gate needs anyway: identity for the
// caller, plus the three fields the lock is derived from.
export type ProjectReadSubject = {
  id: string
  name: string
  status: string
  startsAt: Date | null
  endsAt: Date | null
  visibility: string
}

export type ProjectReadAccess = {
  ok: boolean
  status: 403 | 404 | null
  // Effective role, downgraded to VIEWER while locked — unchanged, so callers
  // that role-check this keep enforcing the lock exactly as before.
  membership: { role: ProjectRole } | null
  // Additive fields. `rawRole` is the real membership role (undowngraded) and
  // `lockedView` says the caller may only be served the reduced lock-screen
  // payload, never the project itself.
  lock: LockState | null
  rawRole: ProjectRole | null
  lockedView: boolean
  project: ProjectReadSubject | null
}

// Read gate for a project and everything scoped under it. A locked (overdue
// past grace) project is closed to its members entirely: leaving reads open
// would make the lock cosmetic, since the tasks, members and milestones it was
// meant to freeze stay fully readable through the sub-resource routes.
//
// `allowLockedDecider` is the one carve-out, opted into by GET /api/projects/:id
// alone: OWNER/PM are the people who must end the overdue state, so they may
// open a locked project — but only far enough to decide. The caller MUST honour
// `lockedView` by serving the reduced payload; every other route leaves the
// option off and so returns 403 to everyone but a system admin.
export async function canReadProject(
  projectId: string,
  authCtx: { userId: string; role: string },
  opts: { allowLockedDecider?: boolean } = {},
): Promise<ProjectReadAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      visibility: true,
      archivedAt: true,
    },
  })
  if (!project) {
    return { ok: false, status: 404, membership: null, lock: null, rawRole: null, lockedView: false, project: null }
  }

  // One project row covers visibility AND the lock, so this replaces the
  // separate requireProjectMember round trip rather than adding to it.
  const raw = await requireProjectMemberRaw(projectId, authCtx.userId)
  const lock = await resolveLockState(project)
  const { archivedAt: _archivedAt, ...subject } = project
  const base = {
    membership: raw ? { role: lock.locked ? ('VIEWER' as ProjectRole) : raw.role } : null,
    lock,
    rawRole: raw?.role ?? null,
    project: subject,
  }
  const admin = isSystemAdmin(authCtx.role)
  if (admin) return { ok: true, status: null, ...base, lockedView: false }

  if (lock.locked) {
    const decider = raw?.role === 'OWNER' || raw?.role === 'PM'
    if (decider && opts.allowLockedDecider) return { ok: true, status: null, ...base, lockedView: true }
    return { ok: false, status: 403, ...base, lockedView: false }
  }

  const isVisible = base.membership != null || project.visibility === 'INTERNAL' || project.visibility === 'PUBLIC'
  if (!isVisible) return { ok: false, status: 403, ...base, lockedView: false }
  return { ok: true, status: null, ...base, lockedView: false }
}
