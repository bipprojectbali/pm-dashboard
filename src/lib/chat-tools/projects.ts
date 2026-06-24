import { z } from 'zod'
import { prisma } from '../db'
import type { ToolResult } from './types'

export const QueryProjectDetailInput = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
})

export async function runQueryProjectDetail(input: z.infer<typeof QueryProjectDetailInput>): Promise<ToolResult> {
  if (!input.projectId && !input.projectName) {
    return { ok: false, error: 'Wajib isi projectId atau projectName' }
  }

  const project = await prisma.project.findFirst({
    where: input.projectId ? { id: input.projectId } : { name: { contains: input.projectName!, mode: 'insensitive' } },
    include: {
      owner: { select: { name: true, email: true } },
      members: { include: { user: { select: { name: true, email: true, role: true } } } },
      milestones: { orderBy: { dueAt: 'asc' } },
      extensions: { orderBy: { createdAt: 'desc' }, include: { extendedBy: { select: { name: true } } } },
      _count: { select: { tasks: true } },
    },
  })
  if (!project) return { ok: true, rows: [], summary: { note: 'Proyek tidak ditemukan' } }

  const now = new Date()
  const taskBreakdown = await prisma.task.groupBy({
    by: ['status'],
    where: { projectId: project.id, deletedAt: null },
    _count: { _all: true },
  })
  const overdueCount = await prisma.task.count({
    where: { projectId: project.id, deletedAt: null, status: { notIn: ['CLOSED'] }, dueAt: { lt: now } },
  })

  return {
    ok: true,
    rows: [{
      id: project.id, name: project.name, status: project.status, priority: project.priority,
      owner: project.owner, startsAt: project.startsAt, endsAt: project.endsAt,
      originalEndAt: project.originalEndAt, archivedAt: project.archivedAt,
      githubRepo: project.githubRepo, description: project.description,
      members: project.members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
      milestones: project.milestones.map((m) => ({
        title: m.title, dueAt: m.dueAt, completedAt: m.completedAt,
        overdue: m.dueAt ? new Date(m.dueAt) < now && !m.completedAt : false,
      })),
      extensions: project.extensions.map((e) => ({
        previousEndAt: e.previousEndAt, newEndAt: e.newEndAt, reason: e.reason,
        extendedBy: e.extendedBy?.name ?? null, createdAt: e.createdAt,
      })),
      taskTotal: project._count.tasks,
      taskBreakdown: Object.fromEntries(taskBreakdown.map((b) => [b.status, b._count._all])),
      overdueTasks: overdueCount,
    }],
  }
}
