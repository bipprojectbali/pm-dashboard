import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'

export const projectsReadonly: ToolModule = {
  name: 'projects-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'project_list',
      {
        title: 'List projects',
        description: 'List projects with member/task counts, status, dates, and task stats.',
        inputSchema: {
          status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ALL']).default('ALL'),
          includeArchived: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(100),
        },
      },
      async ({ status, includeArchived, limit }) => {
        const where: Record<string, unknown> = {}
        if (status !== 'ALL') where.status = status
        if (!includeArchived) where.archivedAt = null
        const projects = await prisma.project.findMany({
          where,
          include: {
            owner: { select: { id: true, name: true, email: true } },
            _count: { select: { members: true, tasks: true, milestones: true } },
          },
          orderBy: [{ status: 'asc' }, { endsAt: 'asc' }, { createdAt: 'desc' }],
          take: limit,
        })
        const stats = await prisma.task.groupBy({
          by: ['projectId', 'status'],
          where: { projectId: { in: projects.map((p) => p.id) } },
          _count: true,
        })
        const statsByProject = new Map<string, Record<string, number>>()
        for (const s of stats) {
          const m = statsByProject.get(s.projectId) ?? {}
          m[s.status] = s._count
          statsByProject.set(s.projectId, m)
        }
        return jsonText({
          count: projects.length,
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            priority: p.priority,
            owner: p.owner.email,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
            originalEndAt: p.originalEndAt,
            archivedAt: p.archivedAt,
            counts: p._count,
            taskStats: statsByProject.get(p.id) ?? {},
          })),
        })
      },
    )

    server.registerTool(
      'project_get',
      {
        title: 'Get project detail',
        description: 'Fetch full project with members, milestones, recent tasks, and recent extensions.',
        inputSchema: {
          projectId: z.string(),
          recentTasks: z.number().int().min(0).max(100).default(10),
        },
      },
      async ({ projectId, recentTasks }) => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            members: {
              include: { user: { select: { id: true, name: true, email: true, role: true } } },
            },
            milestones: { orderBy: [{ order: 'asc' }, { dueAt: 'asc' }] },
            extensions: {
              orderBy: { createdAt: 'desc' },
              include: { extendedBy: { select: { id: true, name: true, email: true } } },
              take: 20,
            },
            _count: { select: { members: true, tasks: true, milestones: true } },
          },
        })
        if (!project) return jsonText({ error: 'Project not found' })
        const tasks = await prisma.task.findMany({
          where: { projectId },
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
          take: recentTasks,
        })
        return jsonText({ project, recentTasks: tasks })
      },
    )
  },
}
