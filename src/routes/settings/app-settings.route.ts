import { Elysia } from 'elysia'
import { getAllSettings, setSetting } from '../../lib/app-settings'
import { getAdminUser, maskSensitive, SENSITIVE_KEYS } from './helpers'

export function appSettingsRoutes() {
  return new Elysia()

    .get('/api/admin/app-settings', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const settings = await getAllSettings()
      return { settings: maskSensitive(settings) }
    })

    .put('/api/admin/app-settings', async ({ request, set, body }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { key, value } = body as { key: string; value: string }
      if (!key || typeof key !== 'string') {
        set.status = 400
        return { error: 'key required' }
      }
      if (typeof value !== 'string') {
        set.status = 400
        return { error: 'value must be string' }
      }
      if (SENSITIVE_KEYS.includes(key) && value === '***') return { ok: true, skipped: true }
      await setSetting(key, value, user.id)
      return { ok: true }
    })
}
