import Elysia from 'elysia'
import { prisma } from '../../lib/db'
import { computeProjectGithubSummary } from '../../lib/github-summary'
import { computeRetro, renderRetroMarkdown } from '../../lib/retro'
import { canReadProject, isSystemAdmin, requireAuth } from '../../lib/route-helpers'

export function projectGithubRoutes() {
  return new Elysia()
    .get('/api/projects/:id/github/summary', async ({ request, params, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const summary = await computeProjectGithubSummary(params.id)
      if (!summary) { set.status = 404; return { error: 'Project not found' } }
      return summary
    })

    .get('/api/projects/:id/github/feed', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) ?? '50', 10) || 50))
      const kindParam = typeof query.kind === 'string' ? query.kind.toUpperCase() : null
      const validKinds = ['PUSH_COMMIT', 'PR_OPENED', 'PR_CLOSED', 'PR_MERGED', 'PR_REVIEWED'] as const
      const kind = validKinds.includes(kindParam as (typeof validKinds)[number])
        ? (kindParam as (typeof validKinds)[number])
        : null
      const events = await prisma.projectGithubEvent.findMany({
        where: { projectId: params.id, ...(kind ? { kind } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { matchedUser: { select: { id: true, name: true, email: true, image: true } } },
      })
      return { events }
    })

    .get('/api/projects/:id/retro', async ({ request, params, query, set }) => {
      const auth = await requireAuth(request)
      if (!auth) { set.status = 401; return { error: 'Unauthorized' } }
      const access = await canReadProject(params.id, auth)
      if (!access.ok) {
        set.status = access.status!
        return { error: access.status === 404 ? 'Project not found' : 'Project not accessible' }
      }
      if (!access.membership && !isSystemAdmin(auth.role)) {
        set.status = 403
        return { error: 'Project membership required' }
      }
      const now = Date.now()
      const defaultSince = new Date(now - 14 * 24 * 60 * 60 * 1000)
      const since = typeof query.since === 'string' ? new Date(query.since) : defaultSince
      const until = typeof query.until === 'string' ? new Date(query.until) : new Date(now)
      if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || until <= since) {
        set.status = 400
        return { error: 'Invalid since/until' }
      }
      const retro = await computeRetro({ projectId: params.id, since, until })
      if (!retro) { set.status = 404; return { error: 'Project not found' } }
      if (query.format === 'md' || query.format === 'markdown') {
        set.headers['content-type'] = 'text/markdown; charset=utf-8'
        return renderRetroMarkdown(retro)
      }
      return retro
    })
}
