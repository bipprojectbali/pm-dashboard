import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { isPhaseNameTaken, phaseNameTakenError } from '../../../src/lib/phase-name'
import { jsonText, type ToolModule } from './shared'

const PhaseStatusEnum = z.enum(['PLANNING', 'ACTIVE', 'COMPLETED'])

async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export const phasesReadonly: ToolModule = {
  name: 'phases-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'phase_list',
      {
        title: 'List project phases',
        description: 'List phases for a project (or all visible projects). Returns phases ordered by order asc.',
        inputSchema: {
          projectId: z.string().optional(),
          status: PhaseStatusEnum.optional(),
          limit: z.number().int().min(1).max(500).default(50),
        },
      },
      async ({ projectId, status, limit }) => {
        const where: Record<string, unknown> = {}
        if (projectId) where.projectId = projectId
        if (status) where.status = status
        const phases = await prisma.projectPhase.findMany({
          where,
          include: { _count: { select: { tasks: { where: { deletedAt: null } } } }, tags: { include: { tag: true } } },
          orderBy: [{ projectId: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
          take: limit,
        })
        return jsonText({ count: phases.length, phases })
      },
    )
  },
}

export const phasesTools: ToolModule = {
  name: 'phases',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'phase_create',
      {
        title: 'Create project phase',
        description: 'Add a phase/sprint to a project. Tasks can be assigned to a phase via task_update phaseId.',
        inputSchema: {
          projectId: z.string(),
          title: z.string().min(1),
          description: z.string().optional(),
          summary: z.string().nullable().optional(),
          status: PhaseStatusEnum.default('PLANNING'),
          startsAt: z.string().optional(),
          endsAt: z.string().optional(),
          order: z.number().int().optional(),
        },
      },
      async ({ projectId, title, description, summary, status, startsAt, endsAt, order }) => {
        if (await isPhaseNameTaken(projectId, title)) {
          return jsonText({ ok: false, error: phaseNameTakenError(title) })
        }
        let nextOrder = order
        if (nextOrder === undefined) {
          const last = await prisma.projectPhase.findFirst({
            where: { projectId },
            orderBy: { order: 'desc' },
            select: { order: true },
          })
          nextOrder = (last?.order ?? -1) + 1
        }
        const phase = await prisma.projectPhase.create({
          data: {
            projectId,
            title,
            description: description ?? null,
            summary: summary ?? null,
            status,
            startsAt: startsAt ? new Date(startsAt) : null,
            endsAt: endsAt ? new Date(endsAt) : null,
            order: nextOrder,
          },
          include: { _count: { select: { tasks: { where: { deletedAt: null } } } }, tags: { include: { tag: true } } },
        })
        await audit(null, 'MCP_PHASE_CREATED', `${projectId} ← ${title}`)
        return jsonText({ ok: true, phase })
      },
    )

    server.registerTool(
      'phase_update',
      {
        title: 'Update project phase',
        description: 'Update phase fields. Set description/startsAt/endsAt to null to clear them. Pass tagIds to replace tags (empty array clears all tags).',
        inputSchema: {
          phaseId: z.string(),
          title: z.string().optional(),
          description: z.string().nullable().optional(),
          summary: z.string().nullable().optional(),
          status: PhaseStatusEnum.optional(),
          startsAt: z.string().nullable().optional(),
          endsAt: z.string().nullable().optional(),
          order: z.number().int().optional(),
          tagIds: z.array(z.string()).optional(),
        },
      },
      async ({ phaseId, startsAt, endsAt, tagIds, ...rest }) => {
        if (rest.title !== undefined) {
          const existing = await prisma.projectPhase.findUnique({
            where: { id: phaseId },
            select: { projectId: true },
          })
          if (!existing) return jsonText({ ok: false, error: 'Phase not found' })
          if (await isPhaseNameTaken(existing.projectId, rest.title, phaseId)) {
            return jsonText({ ok: false, error: phaseNameTakenError(rest.title) })
          }
        }
        const data: Record<string, unknown> = { ...rest }
        if (startsAt !== undefined) data.startsAt = startsAt ? new Date(startsAt) : null
        if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null
        if (tagIds !== undefined) {
          await prisma.phaseTag.deleteMany({ where: { phaseId } })
          if (tagIds.length)
            await prisma.phaseTag.createMany({
              data: tagIds.map((tagId) => ({ phaseId, tagId })),
              skipDuplicates: true,
            })
        }
        const phase = await prisma.projectPhase.update({
          where: { id: phaseId },
          data,
          include: { _count: { select: { tasks: { where: { deletedAt: null } } } }, tags: { include: { tag: true } } },
        })
        await audit(null, 'MCP_PHASE_UPDATED', `${phaseId} ${Object.keys(data).join(',')}`)
        return jsonText({ ok: true, phase })
      },
    )

    server.registerTool(
      'phase_delete',
      {
        title: 'Delete project phase',
        description: 'Permanently delete a phase. Tasks in this phase will have their phaseId cleared (SET NULL).',
        inputSchema: { phaseId: z.string() },
      },
      async ({ phaseId }) => {
        const phase = await prisma.projectPhase.delete({ where: { id: phaseId } })
        await audit(null, 'MCP_PHASE_DELETED', `${phaseId} ${phase.title}`)
        return jsonText({ ok: true, phase })
      },
    )
  },
}
