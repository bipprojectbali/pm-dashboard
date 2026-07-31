import { prisma } from '../lib/db'
import { canCreatePhase, canModifyPhase } from '../lib/phase-access'
import { isPhaseNameTaken, phaseNameTakenError } from '../lib/phase-name'
import { emitInvalidate } from '../lib/presence'
import { canReadProject, getIp, requireAuth, requireProjectMember } from '../lib/route-helpers'

export const PHASE_STATUS_VALUES = ['PLANNING', 'ACTIVE', 'COMPLETED'] as const

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithId = Ctx & { params: { id: string } }

export async function listAllPhasesHandler({ request, set }: Ctx) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const memberships = await prisma.projectMember.findMany({
    where: { userId: auth.userId },
    select: { projectId: true },
  })
  const projectIds = memberships.map((m) => m.projectId)
  if (projectIds.length === 0) return { phases: [] }
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  return { phases }
}

export async function listProjectPhasesHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const access = await canReadProject(params.id, auth)
  if (!access.ok) {
    set.status = access.status!
    return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
  }
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: params.id },
    include: {
      _count: { select: { tasks: { where: { deletedAt: null } } } },
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  return { phases }
}

export async function createPhaseHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const membership = await requireProjectMember(params.id, auth.userId)
  if (!canCreatePhase(auth, membership)) {
    set.status = 403
    return { error: 'Only project OWNER, PM, or SUPER_ADMIN can create phases' }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; status?: string
    startsAt?: string | null; endsAt?: string | null; order?: number; tagIds?: string[]
  }
  if (!body.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
  if (body.status && !(PHASE_STATUS_VALUES as readonly string[]).includes(body.status)) {
    set.status = 400
    return { error: `status must be one of: ${PHASE_STATUS_VALUES.join(', ')}` }
  }
  if (await isPhaseNameTaken(params.id, body.title)) {
    set.status = 409
    return { error: phaseNameTakenError(body.title) }
  }
  const last = await prisma.projectPhase.findFirst({
    where: { projectId: params.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const phase = await prisma.projectPhase.create({
    data: {
      projectId: params.id,
      createdById: auth.userId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: (body.status as 'PLANNING' | 'ACTIVE' | 'COMPLETED' | undefined) ?? 'PLANNING',
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      order: body.order ?? (last?.order ?? -1) + 1,
      tags: body.tagIds?.length
        ? { createMany: { data: body.tagIds.map((tagId) => ({ tagId })), skipDuplicates: true } }
        : undefined,
    },
    include: {
      _count: { select: { tasks: { where: { deletedAt: null } } } },
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  audit(auth.userId, 'PHASE_CREATED', `${params.id} ${phase.title}`, getIp(request))
  emitInvalidate('phases', { projectId: params.id })
  return { phase }
}

export async function updatePhaseHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const existing = await prisma.projectPhase.findUnique({
    where: { id: params.id },
    select: { projectId: true, title: true, createdById: true },
  })
  if (!existing) { set.status = 404; return { error: 'Phase not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canModifyPhase(auth, membership, existing)) {
    set.status = 403
    return { error: "Only the phase's PM creator, project OWNER, or SUPER_ADMIN can modify this phase" }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; summary?: string | null
    status?: string; startsAt?: string | null; endsAt?: string | null; order?: number
    tagIds?: string[]
  }
  if (body.status && !(PHASE_STATUS_VALUES as readonly string[]).includes(body.status)) {
    set.status = 400
    return { error: `status must be one of: ${PHASE_STATUS_VALUES.join(', ')}` }
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const trimmed = body.title.trim()
    if (!trimmed) { set.status = 400; return { error: 'title tidak boleh kosong' } }
    if (await isPhaseNameTaken(existing.projectId, trimmed, params.id)) {
      set.status = 409
      return { error: phaseNameTakenError(trimmed) }
    }
    data.title = trimmed
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.summary !== undefined) data.summary = body.summary?.trim() || null
  if (body.status !== undefined) data.status = body.status
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null
  if (body.order !== undefined) data.order = body.order
  if (body.tagIds !== undefined) {
    await prisma.phaseTag.deleteMany({ where: { phaseId: params.id } })
    if (body.tagIds.length)
      await prisma.phaseTag.createMany({
        data: body.tagIds.map((tagId) => ({ phaseId: params.id, tagId })),
        skipDuplicates: true,
      })
  }
  const phase = await prisma.projectPhase.update({
    where: { id: params.id },
    data,
    include: {
      _count: { select: { tasks: { where: { deletedAt: null } } } },
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  audit(auth.userId, 'PHASE_UPDATED', `${existing.projectId}/${params.id} ${Object.keys(data).join(',')}`, getIp(request))
  emitInvalidate('phases', { projectId: existing.projectId })
  return { phase }
}

export async function deletePhaseHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const existing = await prisma.projectPhase.findUnique({
    where: { id: params.id },
    select: { projectId: true, title: true, createdById: true },
  })
  if (!existing) { set.status = 404; return { error: 'Phase not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canModifyPhase(auth, membership, existing)) {
    set.status = 403
    return { error: "Only the phase's PM creator, project OWNER, or SUPER_ADMIN can delete this phase" }
  }
  await prisma.projectPhase.delete({ where: { id: params.id } })
  audit(auth.userId, 'PHASE_DELETED', `${existing.projectId}/${params.id} ${existing.title}`, getIp(request))
  emitInvalidate('phases', { projectId: existing.projectId })
  return { ok: true }
}
