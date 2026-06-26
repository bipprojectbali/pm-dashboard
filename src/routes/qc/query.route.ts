import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'
import { AI_QUEUE_TAG, getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcQueryRoutes() {
  return new Elysia()

    .get('/api/qc/context', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) return { selfProject: null, canWrite: true, stats: null }
      const grouped = await prisma.task.groupBy({
        by: ['status'],
        where: { projectId: selfProject.id, tags: { some: { tag: { name: AI_QUEUE_TAG } } } },
        _count: true,
      })
      const stats = { OPEN: 0, IN_PROGRESS: 0, READY_FOR_QC: 0, REOPENED: 0, CLOSED: 0 } as Record<string, number>
      for (const g of grouped) stats[g.status] = g._count
      return { selfProject, canWrite: true, stats }
    })

    .get('/api/qc/tickets', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) return { tickets: [], selfProject: null }
      const statusParam = typeof query.status === 'string' ? query.status : 'all'
      const statusFilter: Record<string, string[]> = {
        all: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'],
        open: ['OPEN', 'REOPENED'],
        'in-progress': ['IN_PROGRESS'],
        ready: ['READY_FOR_QC'],
        closed: ['CLOSED'],
      }
      const statuses = statusFilter[statusParam] ?? statusFilter.all
      const priority = typeof query.priority === 'string' ? query.priority : undefined
      const q = typeof query.q === 'string' ? query.q.trim() : ''
      const sortKey: Record<string, 'priority' | 'createdAt' | 'updatedAt' | 'title'> = {
        priority: 'priority', created: 'createdAt', updated: 'updatedAt', title: 'title',
      }
      const sortField = sortKey[typeof query.sort === 'string' ? query.sort : ''] ?? null
      const order = query.order === 'asc' ? 'asc' : 'desc'
      const orderBy = sortField
        ? [{ [sortField]: order } as never]
        : [{ priority: 'desc' as const }, { createdAt: 'desc' as const }]
      const tickets = await prisma.task.findMany({
        where: {
          projectId: selfProject.id,
          tags: { some: { tag: { name: AI_QUEUE_TAG } } },
          status: { in: statuses as never },
          ...(priority ? { priority: priority as never } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' as const } },
                  { description: { contains: q, mode: 'insensitive' as const } },
                  { route: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        include: {
          reporter: { select: { id: true, name: true, email: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { evidence: true, comments: true } },
        },
        orderBy,
      })
      return { tickets, selfProject }
    })

    .get('/api/qc/tickets/:id', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const selfProject = await getSelfProject()
      if (!selfProject) { set.status = 404; return { error: 'No self-project configured' } }
      const ticket = await prisma.task.findFirst({
        where: { id: params.id, projectId: selfProject.id },
        include: {
          reporter: { select: { id: true, name: true, email: true, role: true, image: true } },
          assignee: { select: { id: true, name: true, email: true, role: true, image: true } },
          tags: { include: { tag: true } },
          evidence: { orderBy: { createdAt: 'asc' } },
          comments: {
            include: { author: { select: { id: true, name: true, email: true, role: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
          checklist: { orderBy: { order: 'asc' } },
          statusChanges: {
            include: { author: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!ticket) { set.status = 404; return { error: 'Ticket not found' } }
      return { ticket }
    })
}
