import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken } from '../../lib/route-helpers'
import { computeEnvMap, computeTestCoverage } from './dev-env.helpers'

export function adminDevEnvRoutes() {
  return (
    new Elysia()

      .get('/api/admin/env-map', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        return computeEnvMap(process.cwd())
      })

      .get('/api/admin/test-coverage', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }
        return computeTestCoverage(process.cwd())
      })
  )
}
