import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import Elysia from 'elysia'
import { buildTokenScopedServer } from '../../scripts/mcp/token-scoped-server'
import { appLog } from '../lib/applog'
import { verifyProjectToken } from '../lib/project-access-tokens'
import { prisma } from '../lib/db'

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const raw = header.slice('Bearer '.length).trim()
  return raw || null
}

function unauthorized(message = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }),
    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' } },
  )
}

// Token-scoped HTTP MCP endpoint. A `pmt_` project access token authenticates
// the request and locks every tool to that token's project + scope. Stateless:
// a fresh McpServer + transport is built per request (the SDK forbids reusing a
// stateless transport). Distinct from the stdio MCP server (MCP_SECRET / NODE_ENV).
async function handleMcp(request: Request, parsedBody?: unknown): Promise<Response> {
  const raw = readBearer(request)
  if (!raw || !raw.startsWith('pmt_')) return unauthorized()

  const result = await verifyProjectToken(raw)
  if (!result.ok) {
    await appLog('warn', `MCP token rejected: ${result.reason}`)
    return unauthorized()
  }

  // Dangling-token guard: the project may have been deleted after the token was issued.
  const project = await prisma.project.findUnique({ where: { id: result.projectId }, select: { id: true } })
  if (!project) return unauthorized()

  const ctx = { projectId: result.projectId, scope: result.scope, tokenId: result.tokenId, userId: result.userId }
  const server = buildTokenScopedServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  await appLog('info', `MCP token ${raw.slice(0, 12)}… project=${ctx.projectId} scope=${ctx.scope}`)
  return transport.handleRequest(request, {
    parsedBody,
    authInfo: { token: raw, clientId: ctx.tokenId, scopes: [ctx.scope], extra: ctx },
  })
}

export function mcpRoutes() {
  return new Elysia()
    // Elysia auto-parses JSON bodies, so hand the already-parsed body to the
    // transport (it accepts parsedBody to avoid a second request.json()).
    .post('/mcp', ({ request, body }) => handleMcp(request, body))
    .get('/mcp', ({ request }) => handleMcp(request))
    .delete('/mcp', ({ request }) => handleMcp(request))
}
