import { Elysia } from 'elysia'
import { resolveAgentAuth } from '../../lib/agent-auth'
import { prisma } from '../../lib/db'
import { renderLlmsTxt } from '../../lib/llms-content'
import { getPublicOrigin, requireAuth } from '../../lib/route-helpers'
import { deny } from './shared'

// Guide + project-metadata routes for the token-scoped agent surface.
export function agentProjectRoutes() {
  return (
    new Elysia()
      // Machine-readable guide to this surface. Internal (not a public llms.txt):
      // readable with a pmt_ token OR a logged-in session; anonymous → 401.
      .get('/api/agent/guide', async ({ request, set }) => {
        const tokenAuth = await resolveAgentAuth(request)
        const authed = tokenAuth.ok || (await requireAuth(request)) !== null
        if (!authed) return deny(set, 401, 'Unauthorized — needs a pmt_ access token or a logged-in session')
        set.headers['content-type'] = 'text/plain; charset=utf-8'
        return renderLlmsTxt(getPublicOrigin(request))
      })

      // Project metadata for the token's project so the agent isn't blind to its
      // own name, members (for assigneeEmail), phases, and milestones.
      .get('/api/agent/project', async ({ request, set }) => {
        const auth = await resolveAgentAuth(request)
        if (!auth.ok) return deny(set, auth.status, auth.error)
        const project = await prisma.project.findUnique({
          where: { id: auth.projectId },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            priority: true,
            startsAt: true,
            endsAt: true,
            githubRepo: true,
            isSelf: true,
            members: { select: { role: true, user: { select: { id: true, name: true, email: true } } } },
            phases: {
              orderBy: { order: 'asc' },
              select: { id: true, title: true, status: true, order: true, startsAt: true, endsAt: true },
            },
            milestones: {
              orderBy: { order: 'asc' },
              select: { id: true, title: true, dueAt: true, completedAt: true, order: true },
            },
            _count: { select: { tasks: { where: { deletedAt: null } }, members: true } },
          },
        })
        if (!project) return deny(set, 404, 'Project not found')
        return { project }
      })
  )
}
