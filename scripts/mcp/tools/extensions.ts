import { z } from 'zod'
import { setSetting } from '../../../src/lib/app-settings'
import { prisma } from '../../../src/lib/db'
import {
  EXTENSION_KEYS,
  EXTENSION_META,
  type ExtensionKey,
  getAllExtensions,
  isValidExtensionKey,
} from '../../../src/lib/extensions'
import { errText, jsonText, type ToolModule } from './shared'

export const extensionsReadonly: ToolModule = {
  name: 'extensions-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'extension_list',
      {
        title: 'List app extensions',
        description:
          'Tampilkan semua extension (GitHub Integration, Chat AI) beserta status aktif/nonaktifnya dan deskripsi. Default semua aktif.',
        inputSchema: {},
      },
      async () => {
        const enabled = await getAllExtensions()
        return jsonText({
          extensions: EXTENSION_KEYS.map((k) => ({
            key: k,
            label: EXTENSION_META[k].label,
            description: EXTENSION_META[k].description,
            enabled: enabled[k],
          })),
        })
      },
    )
  },
}

export const extensionsAdmin: ToolModule = {
  name: 'extensions-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'extension_toggle',
      {
        title: 'Toggle an extension on/off',
        description:
          'Aktif/nonaktifkan extension by name. Setting key: extensions.<name>.enabled. Cache 60s di-invalidate otomatis. Audit log entry akan tercatat saat aktor tersedia.',
        inputSchema: {
          name: z.enum(EXTENSION_KEYS).describe('github | chat'),
          enabled: z.boolean(),
          actorEmail: z.string().email().optional().describe('Email user untuk audit log; opsional'),
        },
      },
      async ({ name, enabled, actorEmail }) => {
        if (!isValidExtensionKey(name)) return errText(`Unknown extension: ${name}`)
        const actor = actorEmail
          ? await prisma.user.findUnique({ where: { email: actorEmail }, select: { id: true } })
          : null
        await setSetting(`extensions.${name}.enabled`, enabled ? 'true' : 'false', actor?.id)
        if (actor) {
          await prisma.auditLog
            .create({
              data: {
                userId: actor.id,
                action: 'EXTENSION_TOGGLED',
                detail: JSON.stringify({ name, enabled, source: 'mcp' }),
                ip: null,
              },
            })
            .catch(() => null)
        }
        return jsonText({ ok: true, name, enabled: enabled as boolean })
      },
    )
  },
}

export function extensionsModules(): ToolModule[] {
  return [extensionsReadonly, extensionsAdmin]
}
