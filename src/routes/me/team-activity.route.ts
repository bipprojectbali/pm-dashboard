import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'

export function meTeamActivityRoutes() {
  return new Elysia()

    .get('/api/me/team-activity', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const limitRaw = Number(query?.limit ?? 30)
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 30))
      const memberships = await prisma.projectMember.findMany({
        where: { userId: auth.userId },
        select: { projectId: true },
      })
      const projectIds = memberships.map((m) => m.projectId)
      if (projectIds.length === 0) {
        return { activity: [] }
      }
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [statusChanges, comments] = await Promise.all([
        prisma.taskStatusChange.findMany({
          where: {
            createdAt: { gte: since },
            task: { projectId: { in: projectIds } },
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
            author: { select: { id: true, name: true, email: true, image: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.taskComment.findMany({
          where: {
            createdAt: { gte: since },
            task: { projectId: { in: projectIds } },
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
            author: { select: { id: true, name: true, email: true, image: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ])
      const items = [
        ...statusChanges.map((s) => ({
          kind: 'STATUS_CHANGE' as const,
          id: `s_${s.id}`,
          createdAt: s.createdAt.toISOString(),
          author: s.author,
          task: { id: s.task.id, title: s.task.title, projectId: s.task.projectId },
          project: s.task.project,
          detail: { fromStatus: s.fromStatus, toStatus: s.toStatus, body: null as string | null },
        })),
        ...comments.map((c) => ({
          kind: 'COMMENT' as const,
          id: `c_${c.id}`,
          createdAt: c.createdAt.toISOString(),
          author: c.author,
          task: { id: c.task.id, title: c.task.title, projectId: c.task.projectId },
          project: c.task.project,
          detail: {
            fromStatus: null as string | null,
            toStatus: null as string | null,
            body: c.body.slice(0, 200),
          },
        })),
      ]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
      return { activity: items }
    })
}
