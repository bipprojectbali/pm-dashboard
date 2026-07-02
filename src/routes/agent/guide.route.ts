import { Elysia } from 'elysia'
import { resolveAgentAuth } from '../../lib/agent-auth'
import { renderLlmsTxt } from '../../lib/llms-content'
import { getPublicOrigin, requireAuth } from '../../lib/route-helpers'
import { deny } from './shared'

// Machine-readable guide to the agent REST surface. Internal (not a public
// llms.txt): readable with a pmt_ token OR a logged-in session; anonymous → 401.
export function agentGuideRoutes() {
  return new Elysia().get('/api/agent/guide', async ({ request, set }) => {
    const tokenAuth = await resolveAgentAuth(request)
    const authed = tokenAuth.ok || (await requireAuth(request)) !== null
    if (!authed) return deny(set, 401, 'Unauthorized — needs a pmt_ access token or a logged-in session')
    set.headers['content-type'] = 'text/plain; charset=utf-8'
    return renderLlmsTxt(getPublicOrigin(request))
  })
}
