import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { defaultPreferences, sanitizePreferences } from '../../../src/lib/user-preferences'
import { jsonText, type ToolModule } from './shared'

// Per-user preferences (Settings → Preferensi). Delegates shape/defaults to
// src/lib/user-preferences.ts so MCP and the HTTP endpoint stay in sync.

export const preferencesReadonly: ToolModule = {
  name: 'preferences-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'preferences_get',
      {
        title: 'Get user preferences',
        description:
          "Get a user's preferences (notifications + PM default tab + tasks default filter). Returns defaults when the user has none saved.",
        inputSchema: {
          email: z.string().email().describe('User email to look up'),
        },
      },
      async ({ email }) => {
        const user = await prisma.user.findUnique({ where: { email }, select: { preferences: true } })
        if (!user) return jsonText({ error: `User not found: ${email}` })
        const prefs = user.preferences
          ? sanitizePreferences(user.preferences as Record<string, unknown>)
          : defaultPreferences()
        return jsonText({ email, preferences: prefs })
      },
    )
  },
}

export const preferencesTools: ToolModule = {
  name: 'preferences',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'preferences_set',
      {
        title: 'Set user preferences',
        description:
          "Update a user's preferences. Only provided fields change; the rest keep their current value. Invalid enum values fall back to defaults.",
        inputSchema: {
          email: z.string().email().describe('User email to update'),
          notifyTaskAssigned: z.boolean().optional(),
          notifyTaskStatusChanged: z.boolean().optional(),
          notifyMentioned: z.boolean().optional(),
          notifyProjectDeadline: z.boolean().optional(),
          pmDefaultTab: z
            .enum(['overview', 'projects', 'tasks', 'activity', 'team'])
            .optional()
            .describe('Default tab when opening /pm'),
          tasksDefaultFilter: z
            .enum(['mine', 'all', 'priority'])
            .optional()
            .describe('Default filter applied on the /pm Tasks board'),
        },
      },
      async ({ email, ...updates }) => {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, preferences: true } })
        if (!user) return jsonText({ error: `User not found: ${email}` })
        const current = user.preferences
          ? sanitizePreferences(user.preferences as Record<string, unknown>)
          : defaultPreferences()
        // Drop undefined so only explicitly-provided fields override current.
        const provided = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined))
        const merged = sanitizePreferences({ ...current, ...provided })
        await prisma.user.update({ where: { id: user.id }, data: { preferences: merged } })
        return jsonText({ email, preferences: merged })
      },
    )
  },
}
