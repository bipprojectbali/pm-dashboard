import { Elysia } from 'elysia'
import { setSetting } from '../../lib/app-settings'
import { prisma } from '../../lib/db'
import {
  getAllPermissionRules,
  isValidPermissionKey,
  parseAndValidateValue,
  PERMISSION_RULES,
} from '../../lib/permission-config'
import { getAdminUser } from './helpers'

export function permissionRulesRoutes() {
  return new Elysia()

    .get('/api/admin/permission-rules', async ({ request, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'SUPER_ADMIN only' }
      }
      const values = await getAllPermissionRules()
      const rules = PERMISSION_RULES.map((r) => ({
        key: r.key,
        label: r.label,
        description: r.description,
        type: r.type,
        options: r.options,
        default: r.default,
        current: values[r.key] ?? r.default,
        isDefault: JSON.stringify(values[r.key] ?? r.default) === JSON.stringify(r.default),
      }))
      return { rules }
    })

    .put('/api/admin/permission-rules/:key', async ({ request, params, set }) => {
      const user = await getAdminUser(request)
      if (!user) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      if (user.role !== 'SUPER_ADMIN') {
        set.status = 403
        return { error: 'SUPER_ADMIN only' }
      }
      const key = decodeURIComponent(params.key)
      if (!isValidPermissionKey(key)) {
        set.status = 400
        return { error: 'Unknown permission key' }
      }
      const body = (await request.json().catch(() => null)) as { value?: unknown } | null
      if (!body || !Array.isArray(body.value)) {
        set.status = 400
        return { error: 'body.value must be an array' }
      }
      const raw = JSON.stringify(body.value)
      const { ok, value, error } = parseAndValidateValue(key, raw)
      if (!ok) {
        set.status = 400
        return { error }
      }
      await setSetting(key, JSON.stringify(value), user.id)
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PERMISSION_RULE_UPDATED',
          detail: JSON.stringify({ key, value }),
          ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown',
        },
      })
      return { ok: true, key, value }
    })
}
