import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { findSimilarTickets } from '../../lib/qc-duplicates'
import { requireAuth } from '../../lib/route-helpers'
import { getSelfProject } from '../../lib/self-project'

const QC_ROLES = ['QC', 'ADMIN', 'SUPER_ADMIN'] as const

export function qcDetailRoutes() {
  return new Elysia()

    .get('/api/qc/tickets/similar', async ({ request, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      if (!QC_ROLES.includes(auth.role as never)) { set.status = 403; return { error: 'Forbidden' } }
      const title = typeof query.title === 'string' ? query.title.trim() : ''
      if (!title) { set.status = 400; return { error: 'title wajib diisi' } }
      const limit = Number(query.limit)
      const possibleDuplicates = await findSimilarTickets({
        title,
        ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
      })
      return { possibleDuplicates }
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
