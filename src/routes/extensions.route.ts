// Admin API untuk toggle extension (GitHub, Chat AI).
// GET /api/admin/extensions — list + status (ADMIN + SUPER_ADMIN).
// PUT /api/admin/extensions/:name — toggle on/off (ADMIN + SUPER_ADMIN), audit log.
// GET /api/extensions/status — public-readable status (untuk FE hide UI), tidak butuh admin.

import { Elysia } from 'elysia'
import { setSetting } from '../lib/app-settings'
import { prisma } from '../lib/db'
import {
  EXTENSION_KEYS,
  EXTENSION_META,
  type ExtensionKey,
  getAllExtensions,
  isValidExtensionKey,
} from '../lib/extensions'
import { extractSessionToken, isSystemAdmin } from '../lib/route-helpers'

async function getAdminUser(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const token = extractSessionToken(cookie)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!session || session.expiresAt < new Date() || !isSystemAdmin(session.user.role)) return null
  return session.user
}

async function getAuthedUser(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const token = extractSessionToken(cookie)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    select: { expiresAt: true, userId: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return { id: session.userId }
}

export function extensionsRoutes() {
  return (
    new Elysia()
      .get('/api/admin/extensions', async ({ request, set }) => {
        const user = await getAdminUser(request)
        if (!user) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const enabled = await getAllExtensions()
        const extensions = EXTENSION_KEYS.map((k) => ({
          key: k,
          label: EXTENSION_META[k].label,
          description: EXTENSION_META[k].description,
          enabled: enabled[k],
        }))
        return { extensions }
      })

      .put('/api/admin/extensions/:name', async ({ request, params, body, set }) => {
        const user = await getAdminUser(request)
        if (!user) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const name = params.name
        if (!isValidExtensionKey(name)) {
          set.status = 400
          return { error: `Unknown extension: ${name}` }
        }
        const { enabled } = (body ?? {}) as { enabled?: boolean }
        if (typeof enabled !== 'boolean') {
          set.status = 400
          return { error: 'enabled (boolean) required' }
        }
        await setSetting(`extensions.${name}.enabled`, enabled ? 'true' : 'false', user.id)
        await prisma.auditLog
          .create({
            data: {
              userId: user.id,
              action: 'EXTENSION_TOGGLED',
              detail: JSON.stringify({ name, enabled }),
              ip: request.headers.get('x-forwarded-for') ?? null,
            },
          })
          .catch(() => {})
        return { ok: true, name, enabled }
      })

      // Public-ish: any authenticated user can read which extensions are on
      // (used by FE to hide tabs/cards). Doesn't expose any secrets.
      .get('/api/extensions/status', async ({ request, set }) => {
        const user = await getAuthedUser(request)
        if (!user) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const enabled = await getAllExtensions()
        return { enabled: enabled as Record<ExtensionKey, boolean> }
      })
  )
}
