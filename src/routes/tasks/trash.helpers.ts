import { prisma } from '../../lib/db'
import { requireProjectMember } from '../../lib/route-helpers'

interface AuthInfo {
  userId: string
  role: string
}

export async function checkSingleDeletePermission(
  auth: AuthInfo,
  task: { projectId: string; reporterId: string },
): Promise<boolean> {
  if (auth.role === 'SUPER_ADMIN' || task.reporterId === auth.userId) return true
  const { getPermissionRule } = await import('../../lib/permission-config')
  const membership = await requireProjectMember(task.projectId, auth.userId)
  const allowedDeleteRoles = await getPermissionRule('permissions.task.delete.allowedProjectRoles')
  return !!(membership && allowedDeleteRoles.includes(membership.role))
}

export async function computeBulkDeleteSplit(
  auth: AuthInfo,
  candidates: Array<{ id: string; projectId: string; reporterId: string }>,
): Promise<{ allowedIds: string[]; deniedIds: string[] }> {
  const isSuper = auth.role === 'SUPER_ADMIN'
  let leadProjectIds: Set<string> | null = null
  if (!isSuper) {
    const lead = await prisma.projectMember.findMany({
      where: {
        userId: auth.userId,
        projectId: { in: Array.from(new Set(candidates.map((c) => c.projectId))) },
        role: { in: ['OWNER', 'PM'] },
      },
      select: { projectId: true },
    })
    leadProjectIds = new Set(lead.map((m) => m.projectId))
  }
  const allowedIds: string[] = []
  const deniedIds: string[] = []
  for (const c of candidates) {
    if (isSuper || c.reporterId === auth.userId || leadProjectIds?.has(c.projectId)) allowedIds.push(c.id)
    else deniedIds.push(c.id)
  }
  return { allowedIds, deniedIds }
}

export async function buildTrashWhere(
  auth: Pick<AuthInfo, 'userId'>,
  isAdmin: boolean,
  projectId?: string,
): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { deletedAt: { not: null } }
  if (projectId) where.projectId = String(projectId)
  if (!isAdmin) {
    const myProjectIds = (
      await prisma.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })
    ).map((m) => m.projectId)
    where.project = { OR: [{ id: { in: myProjectIds } }, { visibility: 'INTERNAL' }, { visibility: 'PUBLIC' }] }
  }
  return where
}

export async function checkRestorePermission(
  auth: AuthInfo,
  task: { projectId: string; reporterId: string },
): Promise<boolean> {
  if (auth.role === 'SUPER_ADMIN' || task.reporterId === auth.userId) return true
  const membership = await requireProjectMember(task.projectId, auth.userId)
  return !!(membership && (membership.role === 'OWNER' || membership.role === 'PM'))
}
