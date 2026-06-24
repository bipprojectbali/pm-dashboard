import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText } from './shared'
import { audit, resolveUserEmail } from './projects.helpers'

const TRANSITIONS: Record<string, Record<string, string[]>> = {
  TASK: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['OPEN', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  BUG: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
  QC: {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['READY_FOR_QC', 'CLOSED'],
    READY_FOR_QC: ['CLOSED', 'REOPENED'],
    REOPENED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['REOPENED'],
  },
}

function findStatusPath(kind: string, target: string): string[] | null {
  const graph = TRANSITIONS[kind]
  const queue: Array<{ node: string; path: string[] }> = [{ node: 'OPEN', path: [] }]
  const seen = new Set(['OPEN'])
  while (queue.length) {
    const { node, path } = queue.shift() as { node: string; path: string[] }
    for (const next of graph[node] ?? []) {
      if (seen.has(next)) continue
      const np = [...path, next]
      if (next === target) return np
      seen.add(next)
      queue.push({ node: next, path: np })
    }
  }
  return null
}

export function registerProjectScaffold(server: McpServer) {
  server.registerTool(
    'project_scaffold',
    {
      title: 'Scaffold a complete project (seeding)',
      description:
        'One-call project seed: creates project + owner-as-OWNER + members + tags + milestones + tasks. Tasks can reference tags by NAME (resolved after tag create). Returns summary with counts + created IDs.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        ownerEmail: z.string().email(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
        status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).default('ACTIVE'),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        members: z
          .array(
            z.object({
              email: z.string().email(),
              role: z.enum(['OWNER', 'PM', 'MEMBER', 'VIEWER']).default('MEMBER'),
            }),
          )
          .optional(),
        tags: z
          .array(z.object({ name: z.string().min(1), color: z.string().optional() }))
          .optional(),
        milestones: z
          .array(
            z.object({
              title: z.string().min(1),
              description: z.string().optional(),
              dueAt: z.string().optional(),
              completed: z.boolean().default(false),
            }),
          )
          .optional(),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              description: z.string().min(1),
              kind: z.enum(['TASK', 'BUG', 'QC']).default('TASK'),
              priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
              assigneeEmail: z.string().email().optional(),
              startsAt: z.string().optional(),
              dueAt: z.string().optional(),
              estimateHours: z.number().min(0).optional(),
              tagNames: z.array(z.string()).optional().describe('Resolved against the scaffolded tags by name'),
              finalStatus: z
                .enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])
                .optional(),
            }),
          )
          .optional(),
      },
    },
    async (args) => {
      const owner = await resolveUserEmail(args.ownerEmail)
      if (!owner) return jsonText({ error: `Owner not found: ${args.ownerEmail}` })

      const memberEmails = [...new Set((args.members ?? []).map((m) => m.email))]
      const assigneeEmails = [...new Set((args.tasks ?? []).map((t) => t.assigneeEmail).filter(Boolean) as string[])]
      const allEmails = [...new Set([...memberEmails, ...assigneeEmails])]
      const resolvedUsers = allEmails.length
        ? await prisma.user.findMany({ where: { email: { in: allEmails } }, select: { id: true, email: true } })
        : []
      const userByEmail = new Map(resolvedUsers.map((u) => [u.email, u.id]))
      const missingEmails = allEmails.filter((e) => !userByEmail.has(e))
      if (missingEmails.length) {
        return jsonText({ error: `Users not found: ${missingEmails.join(', ')}` })
      }

      const project = await prisma.project.create({
        data: {
          name: args.name,
          description: args.description ?? null,
          ownerId: owner.id,
          priority: args.priority,
          status: args.status,
          startsAt: args.startsAt ? new Date(args.startsAt) : null,
          endsAt: args.endsAt ? new Date(args.endsAt) : null,
        },
      })

      await prisma.projectMember.create({
        data: { projectId: project.id, userId: owner.id, role: 'OWNER' },
      })
      for (const m of args.members ?? []) {
        if (m.email === args.ownerEmail) continue
        const userId = userByEmail.get(m.email)
        if (!userId) continue
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId } },
          update: { role: m.role },
          create: { projectId: project.id, userId, role: m.role },
        })
      }

      const tagByName = new Map<string, string>()
      for (const t of args.tags ?? []) {
        const tag = await prisma.tag.create({
          data: { projectId: project.id, name: t.name, ...(t.color ? { color: t.color } : {}) },
        })
        tagByName.set(t.name, tag.id)
      }

      const milestones: { id: string; title: string }[] = []
      for (let i = 0; i < (args.milestones ?? []).length; i++) {
        const m = (args.milestones ?? [])[i]
        const milestone = await prisma.projectMilestone.create({
          data: {
            projectId: project.id,
            title: m.title,
            description: m.description ?? null,
            dueAt: m.dueAt ? new Date(m.dueAt) : null,
            order: i,
            completedAt: m.completed ? new Date() : null,
          },
        })
        milestones.push({ id: milestone.id, title: milestone.title })
      }

      const taskResults: Array<{ index: number; ok: boolean; id?: string; error?: string }> = []
      for (let i = 0; i < (args.tasks ?? []).length; i++) {
        const t = (args.tasks ?? [])[i]
        try {
          const tagIds =
            t.tagNames?.map((n) => {
              const id = tagByName.get(n)
              if (!id) throw new Error(`Tag not scaffolded: ${n}`)
              return id
            }) ?? []
          const assigneeId = t.assigneeEmail ? userByEmail.get(t.assigneeEmail) ?? null : null
          const task = await prisma.task.create({
            data: {
              projectId: project.id,
              kind: t.kind,
              title: t.title,
              description: t.description,
              priority: t.priority,
              reporterId: owner.id,
              assigneeId,
              startsAt: t.startsAt ? new Date(t.startsAt) : null,
              dueAt: t.dueAt ? new Date(t.dueAt) : null,
              estimateHours: typeof t.estimateHours === 'number' ? t.estimateHours : null,
              tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
            },
          })
          if (t.finalStatus && t.finalStatus !== 'OPEN') {
            const path = findStatusPath(t.kind, t.finalStatus)
            if (!path) throw new Error(`No valid path OPEN → ${t.finalStatus} for ${t.kind}`)
            let last = 'OPEN'
            for (const next of path) {
              const data: Record<string, unknown> = { status: next }
              if (next === 'CLOSED') data.closedAt = new Date()
              if (next === 'REOPENED') data.closedAt = null
              await prisma.task.update({ where: { id: task.id }, data })
              await prisma.taskStatusChange.create({
                data: {
                  taskId: task.id,
                  authorId: owner.id,
                  fromStatus: last as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
                  toStatus: next as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
                },
              })
              last = next
            }
          }
          taskResults.push({ index: i, ok: true, id: task.id })
        } catch (e) {
          taskResults.push({ index: i, ok: false, error: (e as Error).message })
        }
      }

      await audit(
        owner.id,
        'MCP_PROJECT_SCAFFOLDED',
        `${project.id} "${project.name}" members=${args.members?.length ?? 0} tags=${args.tags?.length ?? 0} milestones=${args.milestones?.length ?? 0} tasks=${taskResults.filter((r) => r.ok).length}/${args.tasks?.length ?? 0}`,
      )
      appLog('info', `MCP: project_scaffold ${project.name} (${project.id})`)

      return jsonText({
        ok: true,
        project: { id: project.id, name: project.name },
        members: (args.members?.length ?? 0) + 1,
        tags: [...tagByName.entries()].map(([name, id]) => ({ name, id })),
        milestones,
        tasks: {
          total: args.tasks?.length ?? 0,
          succeeded: taskResults.filter((r) => r.ok).length,
          results: taskResults,
        },
      })
    },
  )
}
