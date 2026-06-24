import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

const eventInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const

export const eventsReadonly: ToolModule = {
  name: 'events-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'event_list',
      {
        title: 'List team events',
        description: 'List team events/reminders. Filter by upcoming or all. Ordered by startsAt asc.',
        inputSchema: {
          upcoming: z.boolean().optional().describe('Only return future events (startsAt >= now). Default false.'),
          limit: z.number().int().min(1).max(200).optional().describe('Max results. Default 50.'),
        },
      },
      async ({ upcoming, limit = 50 }) => {
        const where = upcoming ? { startsAt: { gte: new Date() } } : {}
        const events = await prisma.event.findMany({
          where,
          orderBy: { startsAt: 'asc' },
          take: limit,
          include: eventInclude,
        })
        return jsonText({ count: events.length, events })
      },
    )
  },
}

export const eventsTools: ToolModule = {
  name: 'events',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'event_create',
      {
        title: 'Create team event',
        description: 'Create a team event/reminder visible to all members.',
        inputSchema: {
          title: z.string().min(1).max(200),
          startsAt: z.string().describe('ISO 8601 datetime, e.g. 2026-06-09T15:30:00+07:00'),
          endsAt: z.string().optional().describe('ISO 8601 datetime for event end'),
          description: z.string().optional(),
          location: z.string().optional(),
          projectId: z.string().optional().describe('Link to an existing project (optional)'),
          createdByEmail: z.string().email().optional().describe('Creator email, defaults to system'),
        },
      },
      async ({ title, startsAt, endsAt, description, location, projectId, createdByEmail }) => {
        try {
          let createdById: string | null = null
          if (createdByEmail) {
            const user = await prisma.user.findUnique({ where: { email: createdByEmail }, select: { id: true } })
            if (!user) return jsonText({ error: `User not found: ${createdByEmail}` })
            createdById = user.id
          }
          const event = await prisma.event.create({
            data: {
              title,
              startsAt: new Date(startsAt),
              endsAt: endsAt ? new Date(endsAt) : null,
              description: description ?? null,
              location: location ?? null,
              projectId: projectId ?? null,
              createdById,
            },
            include: eventInclude,
          })
          return jsonText({ ok: true, event })
        } catch (e) {
          return jsonText({ error: `Create failed: ${(e as Error).message}` })
        }
      },
    )

    server.registerTool(
      'event_update',
      {
        title: 'Update team event',
        description: 'Update title, time, location, or description of an existing event.',
        inputSchema: {
          id: z.string(),
          title: z.string().min(1).max(200).optional(),
          startsAt: z.string().optional(),
          endsAt: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          projectId: z.string().nullable().optional(),
        },
      },
      async ({ id, title, startsAt, endsAt, description, location, projectId }) => {
        const existing = await prisma.event.findUnique({ where: { id } })
        if (!existing) return jsonText({ error: `Event ${id} not found` })

        const data: Record<string, unknown> = { updatedAt: new Date() }
        if (title !== undefined) data.title = title
        if (startsAt !== undefined) data.startsAt = new Date(startsAt)
        if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null
        if (description !== undefined) data.description = description
        if (location !== undefined) data.location = location
        if (projectId !== undefined) data.projectId = projectId

        const event = await prisma.event.update({ where: { id }, data, include: eventInclude })
        return jsonText({ ok: true, event })
      },
    )

    server.registerTool(
      'event_delete',
      {
        title: 'Delete team event',
        description: 'Permanently delete a team event.',
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const existing = await prisma.event.findUnique({ where: { id } })
        if (!existing) return jsonText({ error: `Event ${id} not found` })
        await prisma.event.delete({ where: { id } })
        return jsonText({ ok: true, deleted: id })
      },
    )
  },
}
