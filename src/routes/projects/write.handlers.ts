import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { normalizeGithubRepo } from '../../lib/github'
import { getPermissionRule } from '../../lib/permission-config'
import { emitInvalidate } from '../../lib/presence'
import { withLockBypass } from '../../lib/prisma-project-lock'
import {
  canDecideLockedProject,
  canManageProject,
  getIp,
  requireAuth,
  requireProjectMember,
  requireProjectMemberRaw,
} from '../../lib/route-helpers'
import { audit } from './shared'

// Exits from an overdue lock other than extending. A locked project reports its
// members as VIEWER, which would also block the decisions that end the overdue
// state — so the OWNER keeps these two status transitions, and nothing else.
const DISPOSITION_STATUS = new Set(['COMPLETED', 'CANCELLED'])

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithId = Ctx & { params: { id: string } }

export async function createProjectHandler({ request, set }: Ctx) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  if (auth.role !== 'SUPER_ADMIN') {
    const allowedRoles = await getPermissionRule('permissions.project.create.allowedRoles')
    if (!allowedRoles.includes(auth.role)) {
      set.status = 403
      return { error: 'Only admins can create projects' }
    }
  }
  const body = (await request.json()) as {
    name?: string; description?: string
    status?: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    visibility?: 'PRIVATE' | 'INTERNAL' | 'PUBLIC'
    startsAt?: string | null; endsAt?: string | null
  }
  if (!body.name?.trim()) { set.status = 400; return { error: 'name wajib diisi' } }
  const trimmedName = body.name.trim()
  const duplicate = await prisma.project.findFirst({
    where: { name: { equals: trimmedName, mode: 'insensitive' } },
    select: { id: true },
  })
  if (duplicate) { set.status = 409; return { error: `Project dengan nama "${trimmedName}" sudah ada` } }
  const endsAt = body.endsAt ? new Date(body.endsAt) : null
  const project = await prisma.project.create({
    data: {
      name: trimmedName,
      description: body.description ?? null,
      ownerId: auth.userId,
      status: body.status ?? 'ACTIVE',
      priority: body.priority ?? 'MEDIUM',
      visibility: body.visibility ?? 'INTERNAL',
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt,
      originalEndAt: endsAt,
      members: { create: { userId: auth.userId, role: 'OWNER' } },
    },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { members: true, tasks: true } },
    },
  })
  audit(auth.userId, 'PROJECT_CREATED', `${project.name} (${project.id})`, getIp(request))
  appLog('info', `Project created: ${project.name} by ${auth.email}`)
  emitInvalidate('projects')
  return { project }
}

export async function updateProjectHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const membership = await requireProjectMember(params.id, auth.userId)
  let dispositionOnly = false
  if (!canManageProject(auth, membership)) {
    // Locked projects report every member as VIEWER, so fall back to the raw
    // role — but only the decision carve-out (OWNER + system admin) reaches the
    // disposition path. A PM keeps its normal powers and loses only this.
    const raw = await requireProjectMemberRaw(params.id, auth.userId)
    if (!canDecideLockedProject(auth, raw)) {
      set.status = 403
      return canManageProject(auth, raw)
        ? {
            error: 'Project terkunci karena overdue — hanya pemilik project atau admin yang bisa memutuskan',
            locked: true,
          }
        : { error: 'Only OWNER, PM, or system admin can modify project' }
    }
    dispositionOnly = true
  }
  const body = (await request.json()) as {
    name?: string; description?: string | null
    status?: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    visibility?: 'PRIVATE' | 'INTERNAL' | 'PUBLIC'
    startsAt?: string | null; endsAt?: string | null
    archived?: boolean; githubRepo?: string | null
  }
  if (dispositionOnly) {
    const keys = Object.keys(body)
    if (keys.length !== 1 || keys[0] !== 'status' || !DISPOSITION_STATUS.has(body.status ?? '')) {
      set.status = 403
      return {
        error: 'Project terkunci karena overdue — perpanjang deadline, atau tandai selesai/dibatalkan',
        locked: true,
      }
    }
  }
  const existing = await prisma.project.findUnique({
    where: { id: params.id },
    select: { endsAt: true, originalEndAt: true },
  })
  if (!existing) { set.status = 404; return { error: 'Project not found' } }
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const trimmedName = body.name.trim()
    if (!trimmedName) { set.status = 400; return { error: 'name tidak boleh kosong' } }
    const duplicate = await prisma.project.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' }, NOT: { id: params.id } },
      select: { id: true },
    })
    if (duplicate) { set.status = 409; return { error: `Project dengan nama "${trimmedName}" sudah ada` } }
    data.name = trimmedName
  }
  if (body.description !== undefined) data.description = body.description
  if (body.status !== undefined) data.status = body.status
  if (body.priority !== undefined) data.priority = body.priority
  if (body.visibility !== undefined) data.visibility = body.visibility
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (body.endsAt !== undefined) {
    const newEnd = body.endsAt ? new Date(body.endsAt) : null
    data.endsAt = newEnd
    if (existing.originalEndAt == null && newEnd != null) data.originalEndAt = newEnd
  }
  if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null
  if (body.githubRepo !== undefined) {
    if (body.githubRepo === null || body.githubRepo === '') {
      data.githubRepo = null
    } else {
      const normalized = normalizeGithubRepo(body.githubRepo)
      if (!normalized) { set.status = 400; return { error: 'Invalid GitHub repo — use owner/repo or full URL' } }
      data.githubRepo = normalized
    }
  }
  try {
    // Bypass sanctioned: this handler already decided what a locked project
    // accepts — OWNER/PM get the disposition statuses above and nothing else,
    // a system admin keeps full edit rights. The data-layer guard is actor
    // blind, so without this the disposition that ends the lock would be
    // refused by the lock itself.
    const project = await withLockBypass(() =>
      prisma.project.update({ where: { id: params.id }, data }),
    )
    audit(auth.userId, 'PROJECT_UPDATED', `${project.id} ${Object.keys(data).join(',')}`, getIp(request))
    emitInvalidate('projects', { projectId: project.id })
    return { project }
  } catch (e) {
    const err = e as { code?: string }
    if (err.code === 'P2002') { set.status = 409; return { error: 'This GitHub repo is already linked to another project' } }
    throw e
  }
}

export async function deleteProjectHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { role: true } })
  const membership = await requireProjectMember(params.id, auth.userId)
  const isSuperAdmin = me?.role === 'SUPER_ADMIN'
  if (!isSuperAdmin) {
    const allowedDeleteRoles = await getPermissionRule('permissions.project.delete.allowedProjectRoles')
    if (!membership || !allowedDeleteRoles.includes(membership.role)) {
      set.status = 403
      return { error: 'Only the project OWNER or SUPER_ADMIN can delete a project' }
    }
  }
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
  if (!project) { set.status = 404; return { error: 'Project not found' } }
  await prisma.project.delete({ where: { id: params.id } })
  audit(auth.userId, 'PROJECT_DELETED', `${project.id} ${project.name}`, getIp(request))
  emitInvalidate('projects', { projectId: project.id })
  emitInvalidate('tasks', { projectId: project.id })
  return { ok: true }
}
