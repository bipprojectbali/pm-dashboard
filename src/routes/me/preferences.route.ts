import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireAuth } from '../../lib/route-helpers'
import { defaultPreferences, sanitizePreferences } from '../../lib/user-preferences'

export function mePreferencesRoutes() {
  return new Elysia()

    .get('/api/me/preferences', async ({ request, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { preferences: true },
      })
      // Sanitize on read so legacy rows (e.g. holding the removed tableDensity)
      // return only the current shape.
      const prefs = user?.preferences
        ? sanitizePreferences(user.preferences as Record<string, unknown>)
        : defaultPreferences()
      return { preferences: prefs }
    })

    .put('/api/me/preferences', async ({ request, body, set }) => {
      const auth = await requireAuth(request)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const incoming = (body ?? {}) as Record<string, unknown>
      const merged = sanitizePreferences(incoming)
      await prisma.user.update({
        where: { id: auth.userId },
        data: { preferences: merged },
      })
      return { preferences: merged }
    })
}
