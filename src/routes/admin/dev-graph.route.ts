import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken } from '../../lib/route-helpers'
import { computeDependencies, computeMigrations } from './dev-graph.helpers'

async function requireSuperAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: 401 | 403; error: string }> {
  const token = extractSessionToken(request.headers.get('cookie') ?? '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { role: true } } },
  })
  if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true }
}

export function adminDevGraphRoutes() {
  return (
    new Elysia()

      .get('/api/admin/dependencies', async ({ request, set }) => {
        const auth = await requireSuperAdmin(request)
        if (!auth.ok) { set.status = auth.status; return { error: auth.error } }
        const result = computeDependencies(process.cwd())
        if (!result) { set.status = 404; return { error: 'package.json not found' } }
        return result
      })

      .get('/api/admin/migrations', async ({ request, set }) => {
        const auth = await requireSuperAdmin(request)
        if (!auth.ok) { set.status = auth.status; return { error: auth.error } }
        return computeMigrations(process.cwd())
      })
  )
}
