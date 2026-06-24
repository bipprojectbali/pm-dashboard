import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken } from '../../lib/route-helpers'
import { ROUTES_METADATA } from '../../lib/routes-metadata'
import { parseSchema } from '../../lib/schema-parser'
import { scanProjectStructure } from './dev-code.helpers'

type AuthResult = { ok: true } | { ok: false; status: 401 | 403; error: string }

async function requireSuperAdmin(request: Request): Promise<AuthResult> {
  const cookie = request.headers.get('cookie') ?? ''
  const token = extractSessionToken(cookie)
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

export function adminDevCodeRoutes() {
  return (
    new Elysia()

      .get('/api/admin/schema', async ({ request, set }) => {
        const auth = await requireSuperAdmin(request)
        if (!auth.ok) { set.status = auth.status; return { error: auth.error } }

        const fs = await import('node:fs')
        const schemaPath = `${process.cwd()}/prisma/schema.prisma`
        if (!fs.existsSync(schemaPath)) { set.status = 404; return { error: 'Schema not found' } }
        const raw = fs.readFileSync(schemaPath, 'utf-8')
        return { schema: parseSchema(raw) }
      })

      .get('/api/admin/routes', async ({ request, set }) => {
        const auth = await requireSuperAdmin(request)
        if (!auth.ok) { set.status = auth.status; return { error: auth.error } }

        const routes = ROUTES_METADATA
        const byMethod: Record<string, number> = {}
        const byAuth: Record<string, number> = {}
        const byCategory: Record<string, number> = {}
        for (const r of routes) {
          byMethod[r.method] = (byMethod[r.method] || 0) + 1
          byAuth[r.auth] = (byAuth[r.auth] || 0) + 1
          byCategory[r.category] = (byCategory[r.category] || 0) + 1
        }
        return { routes, summary: { total: routes.length, byMethod, byAuth, byCategory } }
      })

      .get('/api/admin/project-structure', async ({ request, set }) => {
        const auth = await requireSuperAdmin(request)
        if (!auth.ok) { set.status = auth.status; return { error: auth.error } }
        return scanProjectStructure()
      })
  )
}
