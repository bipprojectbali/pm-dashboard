import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { canManageProject, canReadProject, getIp, requireAuth, requireProjectMember } from '../../lib/route-helpers'
import { audit } from './shared'

export const milestoneInclude = { tags: { include: { tag: true } } } as const

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithId = Ctx & { params: { id: string } }

export async function listAllMilestonesHandler({ request, set }: Ctx) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const memberships = await prisma.projectMember.findMany({
    where: { userId: auth.userId },
    select: { projectId: true },
  })
  const projectIds = memberships.map((m) => m.projectId)
  if (projectIds.length === 0) return { milestones: [] }
  const milestones = await prisma.projectMilestone.findMany({
    where: { projectId: { in: projectIds } },
    include: milestoneInclude,
    orderBy: [{ order: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
  })
  return { milestones }
}

export async function listProjectMilestonesHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const access = await canReadProject(params.id, auth)
  if (!access.ok) {
    set.status = access.status!
    return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
  }
  const milestones = await prisma.projectMilestone.findMany({
    where: { projectId: params.id },
    include: milestoneInclude,
    orderBy: [{ order: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
  })
  return { milestones }
}

export async function createMilestoneHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const membership = await requireProjectMember(params.id, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can create milestones' }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; dueAt?: string | null; tagIds?: string[]
  }
  if (!body.title?.trim()) { set.status = 400; return { error: 'title wajib diisi' } }
  const last = await prisma.projectMilestone.findFirst({
    where: { projectId: params.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const created = await prisma.projectMilestone.create({
    data: {
      projectId: params.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      order: (last?.order ?? -1) + 1,
    },
  })
  if (body.tagIds?.length) {
    await prisma.milestoneTag.createMany({
      data: body.tagIds.map((tagId) => ({ milestoneId: created.id, tagId })),
      skipDuplicates: true,
    })
  }
  const milestone = await prisma.projectMilestone.findUnique({ where: { id: created.id }, include: milestoneInclude })
  audit(auth.userId, 'MILESTONE_CREATED', `${params.id} ${created.title}`, getIp(request))
  emitInvalidate('milestones', { projectId: params.id })
  return { milestone }
}

export async function updateMilestoneHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const existing = await prisma.projectMilestone.findUnique({
    where: { id: params.id },
    select: { projectId: true, completedAt: true },
  })
  if (!existing) { set.status = 404; return { error: 'Milestone not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can modify milestones' }
  }
  const body = (await request.json()) as {
    title?: string; description?: string | null; dueAt?: string | null
    completed?: boolean; order?: number; tagIds?: string[]
  }
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (body.completed !== undefined) data.completedAt = body.completed ? new Date() : null
  if (body.order !== undefined) data.order = body.order
  await prisma.projectMilestone.update({ where: { id: params.id }, data })
  if (body.tagIds !== undefined) {
    await prisma.milestoneTag.deleteMany({ where: { milestoneId: params.id } })
    if (body.tagIds.length) {
      await prisma.milestoneTag.createMany({
        data: body.tagIds.map((tagId) => ({ milestoneId: params.id, tagId })),
        skipDuplicates: true,
      })
    }
  }
  const milestone = await prisma.projectMilestone.findUnique({ where: { id: params.id }, include: milestoneInclude })
  audit(auth.userId, 'MILESTONE_UPDATED', `${existing.projectId}/${params.id} ${Object.keys(data).join(',')}`, getIp(request))
  emitInvalidate('milestones', { projectId: existing.projectId })
  return { milestone }
}

export async function deleteMilestoneHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
  const existing = await prisma.projectMilestone.findUnique({
    where: { id: params.id },
    select: { projectId: true, title: true },
  })
  if (!existing) { set.status = 404; return { error: 'Milestone not found' } }
  const membership = await requireProjectMember(existing.projectId, auth.userId)
  if (!canManageProject(auth, membership)) {
    set.status = 403
    return { error: 'Only OWNER, PM, or system admin can delete milestones' }
  }
  await prisma.projectMilestone.delete({ where: { id: params.id } })
  audit(auth.userId, 'MILESTONE_DELETED', `${existing.projectId}/${params.id} ${existing.title}`, getIp(request))
  emitInvalidate('milestones', { projectId: existing.projectId })
  return { ok: true }
}
