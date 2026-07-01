import { prisma } from './db'
import { verifyProjectToken } from './project-access-tokens'

// Auth context for the token-only `/api/agent/*` surface. Distinct from session
// auth (requireAuth): the project + scope come entirely from the pmt_ token, so
// an agent never passes projectId and can never touch another project.
export type AgentAuth =
  | { ok: true; projectId: string; scope: 'READ' | 'WRITE'; userId: string | null }
  | { ok: false; status: 401 | 403; error: string }

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const raw = header.slice('Bearer '.length).trim()
  return raw || null
}

export async function resolveAgentAuth(request: Request): Promise<AgentAuth> {
  const raw = readBearer(request)
  if (!raw || !raw.startsWith('pmt_')) return { ok: false, status: 401, error: 'Unauthorized' }

  const result = await verifyProjectToken(raw)
  if (!result.ok) return { ok: false, status: 401, error: 'Unauthorized' }

  // Dangling-token guard: project may have been deleted after the token was issued.
  const project = await prisma.project.findUnique({ where: { id: result.projectId }, select: { id: true } })
  if (!project) return { ok: false, status: 401, error: 'Unauthorized' }

  return { ok: true, projectId: result.projectId, scope: result.scope, userId: result.userId }
}

// A pmt_ token's creator may have been deleted (userId null). Task/comment rows
// need a non-null author, so fall back to the project owner.
export async function resolveReporterId(projectId: string, userId: string | null): Promise<string> {
  if (userId) return userId
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
  if (!project) throw new Error('Project not found')
  return project.ownerId
}

// True when the token may write. Callers return 403 on false.
export function canWrite(auth: { scope: 'READ' | 'WRITE' }): boolean {
  return auth.scope === 'WRITE'
}
