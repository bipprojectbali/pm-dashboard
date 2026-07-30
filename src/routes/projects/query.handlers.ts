import type { Prisma } from '../../../generated/prisma'
import { prisma } from '../../lib/db'
import { isSystemAdmin, requireAuth, requireProjectMember } from '../../lib/route-helpers'

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithQuery = Ctx & { query: Record<string, string> }
type CtxWithId = Ctx & { params: { id: string } }

const PROJECT_INCLUDE = {
  owner: { select: { id: true, name: true, email: true, image: true } },
  members: {
    include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
    orderBy: { joinedAt: 'asc' as const },
  },
  // tasks count must exclude trashed rows — the soft-delete extension only
  // rewrites direct Task reads, not relation `_count` (see ARCHITECTURE.md).
  _count: { select: { members: true, tasks: { where: { deletedAt: null } }, milestones: true, phases: true } },
} as const

function buildTaskStats(s: Record<string, number>) {
  return {
    open: s.OPEN ?? 0,
    inProgress: s.IN_PROGRESS ?? 0,
    readyForQc: s.READY_FOR_QC ?? 0,
    reopened: s.REOPENED ?? 0,
    closed: s.CLOSED ?? 0,
    total: (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
  }
}

export async function listUsersHandler({ request, set }: Ctx) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const users = await prisma.user.findMany({
    where: { blocked: false },
    select: { id: true, name: true, email: true, role: true, image: true },
    orderBy: { name: 'asc' },
  })
  return { users }
}

export async function listProjectsHandler({ request, query, set }: CtxWithQuery) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }

  const isAdmin = isSystemAdmin(auth.role)
  const scope = query.scope || 'visible'
  const limit = Math.min(Number(query.limit) || 200, 200)
  const offset = Math.max(0, Number(query.offset) || 0)
  // Archived projects are hidden by default in listings (same convention as
  // the admin-overview aggregates and the MCP project tools). Opt in with
  // ?includeArchived=true when a caller genuinely needs the archive.
  const includeArchived = query.includeArchived === 'true'

  const memberships = await prisma.projectMember.findMany({
    where: { userId: auth.userId },
    include: { project: { include: PROJECT_INCLUDE } },
    orderBy: { joinedAt: 'desc' },
  })

  const roleByProject = new Map<string, 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER'>()
  const joinedAtByProject = new Map<string, Date>()
  for (const m of memberships) {
    roleByProject.set(m.projectId, m.role)
    joinedAtByProject.set(m.projectId, m.joinedAt)
  }

  type ProjectRow = (typeof memberships)[number]['project']
  let projectRows: ProjectRow[]

  const archivedFilter = includeArchived ? {} : { archivedAt: null }

  // `total` = full count of matching projects BEFORE the take/skip window, so
  // the client can tell when the list is truncated (it renders a banner) instead
  // of silently computing portfolio stats over a capped page.
  let total: number

  if (scope === 'mine') {
    const mineRows = memberships.map((m) => m.project).filter((p) => includeArchived || p.archivedAt === null)
    total = mineRows.length
    projectRows = mineRows.slice(offset, offset + limit)
  } else {
    const where: Prisma.ProjectWhereInput = isAdmin
      ? { ...archivedFilter }
      : {
          ...archivedFilter,
          OR: [{ visibility: { in: ['INTERNAL', 'PUBLIC'] } }, { members: { some: { userId: auth.userId } } }],
        }
    ;[projectRows, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.project.count({ where }),
    ])
  }

  const projectIds = projectRows.map((p) => p.id)

  const [taskGroups, milestonesDone] = await Promise.all([
    projectIds.length
      ? prisma.task.groupBy({
          by: ['projectId', 'status'],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        })
      : [],
    projectIds.length
      ? prisma.projectMilestone.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds }, completedAt: { not: null } },
          _count: { _all: true },
        })
      : [],
  ])

  const statsByProject = new Map<string, Record<string, number>>()
  for (const g of taskGroups) {
    const row = statsByProject.get(g.projectId) ?? {}
    row[g.status] = g._count._all
    statsByProject.set(g.projectId, row)
  }
  const doneByProject = new Map<string, number>(milestonesDone.map((m) => [m.projectId, m._count._all]))

  return {
    projects: projectRows.map((p) => {
      const myRole = roleByProject.get(p.id) ?? null
      return {
        ...p,
        myRole,
        joinedAt: joinedAtByProject.get(p.id) ?? null,
        canWrite: isAdmin || myRole != null,
        taskStats: buildTaskStats(statsByProject.get(p.id) ?? {}),
        milestoneStats: { done: doneByProject.get(p.id) ?? 0, total: p._count.milestones },
      }
    }),
    total,
    limit,
    offset,
  }
}

export async function getProjectHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: PROJECT_INCLUDE,
  })
  if (!project) {
    set.status = 404
    return { error: 'Project not found' }
  }

  const membership = await requireProjectMember(params.id, auth.userId)
  const isAdmin = isSystemAdmin(auth.role)
  const isVisible =
    isAdmin || membership != null || project.visibility === 'INTERNAL' || project.visibility === 'PUBLIC'
  if (!isVisible) {
    set.status = 403
    return { error: 'Project not accessible' }
  }

  const [grouped, milestonesDone] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: { projectId: params.id }, _count: { _all: true } }),
    // milestoneStats.done is needed by the Overview card — the list handler sets
    // it but the detail handler used to omit it, so the card always showed 0/N.
    prisma.projectMilestone.count({ where: { projectId: params.id, completedAt: { not: null } } }),
  ])
  const s: Record<string, number> = {}
  for (const g of grouped) s[g.status] = g._count._all

  return {
    project: {
      ...project,
      taskStats: buildTaskStats(s),
      milestoneStats: { done: milestonesDone, total: project._count.milestones },
    },
    myRole: membership?.role ?? null,
    canWrite: isAdmin || membership != null,
  }
}
