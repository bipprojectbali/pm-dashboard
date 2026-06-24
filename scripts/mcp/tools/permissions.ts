import { z } from 'zod'
import { setSetting } from '../../../src/lib/app-settings'
import { prisma } from '../../../src/lib/db'
import {
  getAllPermissionRules,
  isValidPermissionKey,
  parseAndValidateValue,
  PERMISSION_RULES,
} from '../../../src/lib/permission-config'
import { errText, jsonText, type ToolModule } from './shared'

export const permissionsReadonly: ToolModule = {
  name: 'permissions-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'permission_rules_list',
      {
        title: 'List permission rules',
        description:
          'Tampilkan 4 aturan izin yang dapat dikonfigurasi: project create/delete, task write/delete. Includes nilai aktif, default, dan apakah sedang di-override.',
        inputSchema: {},
      },
      async () => {
        const values = await getAllPermissionRules()
        return jsonText({
          rules: PERMISSION_RULES.map((r) => ({
            key: r.key,
            label: r.label,
            description: r.description,
            type: r.type,
            options: r.options,
            default: r.default,
            current: values[r.key] ?? r.default,
            isDefault: JSON.stringify(values[r.key] ?? r.default) === JSON.stringify(r.default),
          })),
        })
      },
    )
  },
}

export const permissionsAdmin: ToolModule = {
  name: 'permissions-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'permission_rule_set',
      {
        title: 'Set a permission rule',
        description:
          'Update satu aturan izin. Cache 60s di-invalidate otomatis. SUPER_ADMIN selalu bypass — tidak bisa dikunci. Audit log PERMISSION_RULE_UPDATED tercatat bila actorEmail tersedia.',
        inputSchema: {
          key: z
            .string()
            .describe(
              'Key aturan: permissions.project.create.allowedRoles | permissions.project.delete.allowedProjectRoles | permissions.task.write.minProjectRole | permissions.task.delete.allowedProjectRoles',
            ),
          value: z.array(z.string()).min(1).describe('Array nilai baru, misalnya ["OWNER","PM"]'),
          actorEmail: z.string().email().optional().describe('Email aktor untuk audit log; opsional'),
        },
      },
      async ({ key, value, actorEmail }) => {
        if (!isValidPermissionKey(key)) return errText(`Unknown permission key: ${key}`)
        const { ok, value: parsed, error } = parseAndValidateValue(key, JSON.stringify(value))
        if (!ok) return errText(`Nilai tidak valid: ${error}`)
        const actor = actorEmail
          ? await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
          : null
        await setSetting(key, JSON.stringify(parsed), actor?.id)
        if (actor) {
          await prisma.auditLog
            .create({
              data: {
                userId: actor.id,
                action: 'PERMISSION_RULE_UPDATED',
                detail: JSON.stringify({ key, value: parsed }),
                ip: null,
              },
            })
            .catch(() => null)
        }
        return jsonText({ ok: true, key, value: parsed })
      },
    )
  },
}

export function permissionsModules(): ToolModule[] {
  return [permissionsReadonly, permissionsAdmin]
}
