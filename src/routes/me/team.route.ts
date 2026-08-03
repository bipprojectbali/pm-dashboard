import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'
import { WORKLOAD_KIND_FILTER } from '../../lib/task-metrics'

export function meTeamRoutes() {
  return new Elysia()

    .get('/api/me/team', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        select: { projectId: true, role: true, project: { select: { id: true, name: true } } },
      })
      const projectIds = memberships.map((m) => m.projectId)
      if (projectIds.length === 0) {
        return { teammates: [], projects: [] }
      }
      const myRoleByProject = new Map(memberships.map((m) => [m.projectId, m.role]))
      const allMembers = await prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, blocked: true, image: true } },
          project: { select: { id: true, name: true } },
        },
      })
      type ShareEntry = { projectId: string; projectName: string; myRole: string; theirRole: string }
      type Teammate = {
        id: string
        name: string
        email: string
        role: string
        blocked: boolean
        image: string | null
        sharedProjects: ShareEntry[]
      }
      const teammateMap = new Map<string, Teammate>()
      for (const m of allMembers) {
        if (m.userId === auth.userId) continue
        if (m.user.blocked) continue
        const existing: Teammate = teammateMap.get(m.userId) ?? {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.user.role,
          blocked: m.user.blocked,
          image: m.user.image ?? null,
          sharedProjects: [],
        }
        existing.sharedProjects.push({
          projectId: m.projectId,
          projectName: m.project.name,
          myRole: myRoleByProject.get(m.projectId) ?? 'MEMBER',
          theirRole: m.role,
        })
        teammateMap.set(m.userId, existing)
      }
      const teammateIds = Array.from(teammateMap.keys())
      if (teammateIds.length === 0) {
        return {
          teammates: [],
          projects: memberships.map((m) => ({ id: m.project.id, name: m.project.name, myRole: m.role })),
        }
      }
      const now = new Date()
      const [openCounts, overdueCounts] = await Promise.all([
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            ...WORKLOAD_KIND_FILTER,
            projectId: { in: projectIds },
            assigneeId: { in: teammateIds },
            status: { not: 'CLOSED' },
          },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            ...WORKLOAD_KIND_FILTER,
            projectId: { in: projectIds },
            assigneeId: { in: teammateIds },
            status: { not: 'CLOSED' },
            dueAt: { lt: now },
          },
          _count: { _all: true },
        }),
      ])
      const openByUser = new Map(openCounts.filter((c) => c.assigneeId).map((c) => [c.assigneeId!, c._count._all]))
      const overdueByUser = new Map(
        overdueCounts.filter((c) => c.assigneeId).map((c) => [c.assigneeId!, c._count._all]),
      )
      const teammates = Array.from(teammateMap.values()).map((t) => ({
        ...t,
        openTasks: openByUser.get(t.id) ?? 0,
        overdueTasks: overdueByUser.get(t.id) ?? 0,
      }))
      teammates.sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name))
      return {
        teammates,
        projects: memberships.map((m) => ({ id: m.project.id, name: m.project.name, myRole: m.role })),
      }
    })
}
