import { prisma } from '../lib/db'
import { emitInvalidate } from '../lib/presence'
import { canManageProject, canReadProject, getIp, requireAuth, requireProjectMember } from '../lib/route-helpers'

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
    include: { _count: { select: { tasks: true } } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  return { phases }
}

export async function createPhaseHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const membership = await requireProjectMember(params.id, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can create phases' }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; status?: string
    startsAt?: string | null; endsAt?: string | null; order?: number
  }
  if (!body.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
  if (body.status && !(PHASE_STATUS_VALUES as readonly string[]).includes(body.status)) {
    set.status = 400
    return { error: `status must be one of: ${PHASE_STATUS_VALUES.join(', ')}` }
  }
  const last = await prisma.projectPhase.findFirst({
    where: { projectId: params.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const phase = await prisma.projectPhase.create({
    data: {
      projectId: params.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: (body.status as 'PLANNING' | 'ACTIVE' | 'COMPLETED' | undefined) ?? 'PLANNING',
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      order: body.order ?? (last?.order ?? -1) + 1,
    },
    include: { _count: { select: { tasks: true } } },
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
    select: { projectId: true, title: true },
  })
  if (!existing) { set.status = 404; return { error: 'Phase not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can modify phases' }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; summary?: string | null
    status?: string; startsAt?: string | null; endsAt?: string | null; order?: number
  }
  if (body.status && !(PHASE_STATUS_VALUES as readonly string[]).includes(body.status)) {
    set.status = 400
    return { error: `status must be one of: ${PHASE_STATUS_VALUES.join(', ')}` }
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.summary !== undefined) data.summary = body.summary?.trim() || null
  if (body.status !== undefined) data.status = body.status
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null
  if (body.order !== undefined) data.order = body.order
  const phase = await prisma.projectPhase.update({
    where: { id: params.id },
    data,
    include: { _count: { select: { tasks: true } } },
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
    select: { projectId: true, title: true },
  })
  if (!existing) { set.status = 404; return { error: 'Phase not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can delete phases' }
  }
  await prisma.projectPhase.delete({ where: { id: params.id } })
  audit(auth.userId, 'PHASE_DELETED', `${existing.projectId}/${params.id} ${existing.title}`, getIp(request))
  emitInvalidate('phases', { projectId: existing.projectId })
  return { ok: true }
}
