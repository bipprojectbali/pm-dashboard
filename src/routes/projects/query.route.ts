import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { canReadProject, isSystemAdmin, requireAuth, requireProjectMember } from '../../lib/route-helpers'

export function projectQueryRoutes() {
  return new Elysia()
    .get('/api/users', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const users = await prisma.user.findMany({
        where: { blocked: false },
        select: { id: true, name: true, email: true, role: true, image: true },
        orderBy: { name: 'asc' },
      })
      return { users }
    })

    .get('/api/projects', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const isAdmin = isSystemAdmin(auth.role)
      const scope = typeof query.scope === 'string' ? query.scope : 'visible'
      const projLimit = Math.min(Number(query.limit) || 200, 200)
      const projOffset = Math.max(0, Number(query.offset) || 0)
      const projectInclude = {
        owner: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { members: true, tasks: true, milestones: true, phases: true } },
      } as const
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        include: { project: { include: projectInclude } },
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
      if (scope === 'mine') {
        projectRows = memberships.map((m) => m.project)
      } else if (isAdmin) {
        projectRows = await prisma.project.findMany({
          include: projectInclude,
          orderBy: { createdAt: 'desc' },
          take: projLimit,
          skip: projOffset,
        })
      } else {
        projectRows = await prisma.project.findMany({
          where: {
            OR: [{ visibility: { in: ['INTERNAL', 'PUBLIC'] } }, { members: { some: { userId: auth.userId } } }],
          },
          include: projectInclude,
          orderBy: { createdAt: 'desc' },
          take: projLimit,
          skip: projOffset,
        })
      }
      const projectIds = projectRows.map((p) => p.id)
      const grouped = projectIds.length
        ? await prisma.task.groupBy({
            by: ['projectId', 'status'],
            where: { projectId: { in: projectIds } },
            _count: { _all: true },
          })
        : []
      const statsByProject = new Map<string, Record<string, number>>()
      for (const g of grouped) {
        const row = statsByProject.get(g.projectId) ?? {}
        row[g.status] = g._count._all
        statsByProject.set(g.projectId, row)
      }
      const milestonesDone = projectIds.length
        ? await prisma.projectMilestone.groupBy({
            by: ['projectId'],
            where: { projectId: { in: projectIds }, completedAt: { not: null } },
            _count: { _all: true },
          })
        : []
      const doneByProject = new Map<string, number>(milestonesDone.map((m) => [m.projectId, m._count._all]))
      return {
        projects: projectRows.map((p) => {
          const s = statsByProject.get(p.id) ?? {}
          const myRole = roleByProject.get(p.id) ?? null
          return {
            ...p,
            myRole,
            joinedAt: joinedAtByProject.get(p.id) ?? null,
            canWrite: isAdmin || myRole != null,
            taskStats: {
              open: s.OPEN ?? 0,
              inProgress: s.IN_PROGRESS ?? 0,
              readyForQc: s.READY_FOR_QC ?? 0,
              reopened: s.REOPENED ?? 0,
              closed: s.CLOSED ?? 0,
              total: (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
            },
            milestoneStats: {
              done: doneByProject.get(p.id) ?? 0,
              total: p._count.milestones,
            },
          }
        }),
      }
    })

    .get('/api/projects/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
          members: {
            include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
            orderBy: { joinedAt: 'asc' },
          },
          _count: { select: { tasks: true, members: true, milestones: true, phases: true } },
        },
      })
      if (!project) { set.status = 404; return { error: 'Project not found' } }
      const membership = await requireProjectMember(params.id, auth.userId)
      const isAdmin = isSystemAdmin(auth.role)
      const isVisible =
        isAdmin || membership != null || project.visibility === 'INTERNAL' || project.visibility === 'PUBLIC'
      if (!isVisible) { set.status = 403; return { error: 'Project not accessible' } }
      const grouped = await prisma.task.groupBy({
        by: ['status'],
        where: { projectId: params.id },
        _count: { _all: true },
      })
      const s: Record<string, number> = {}
      for (const g of grouped) s[g.status] = g._count._all
      const taskStats = {
        open: s.OPEN ?? 0,
        inProgress: s.IN_PROGRESS ?? 0,
        readyForQc: s.READY_FOR_QC ?? 0,
        reopened: s.REOPENED ?? 0,
        closed: s.CLOSED ?? 0,
        total: (s.OPEN ?? 0) + (s.IN_PROGRESS ?? 0) + (s.READY_FOR_QC ?? 0) + (s.REOPENED ?? 0) + (s.CLOSED ?? 0),
      }
      return {
        project: { ...project, taskStats },
        myRole: membership?.role ?? null,
        canWrite: isAdmin || membership != null,
      }
    })
}
