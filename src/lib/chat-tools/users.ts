import { z } from 'zod'
import { prisma } from '../db'
import { MAX_ROWS, type ToolResult } from './types'

export const QueryUsersInput = z.object({
  query: z.string().optional(),
  role: z.enum(['USER', 'QC', 'ADMIN', 'SUPER_ADMIN']).optional(),
  includeBlocked: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

export async function runQueryUsers(input: z.infer<typeof QueryUsersInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const now = new Date()
  const where: Record<string, unknown> = {}
  if (!input.includeBlocked) where.blocked = false
  if (input.role) where.role = input.role
  if (input.query) {
    where.OR = [
      { name: { contains: input.query, mode: 'insensitive' } },
      { email: { contains: input.query, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.user.count({ where })
  const users = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: { name: 'asc' },
    include: {
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, dueAt: true, estimateHours: true, priority: true },
      },
      _count: { select: { projectMemberships: true } },
    },
  })

  const rows = users.map((u) => {
    const open = u.assignedTasks.length
    const overdue = u.assignedTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now).length
    const estimateTotal = u.assignedTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, blocked: u.blocked,
      projectCount: u._count.projectMemberships, openTasks: open, overdueTasks: overdue,
      sumEstimateHours: Math.round(estimateTotal * 10) / 10,
    }
  })

  return { ok: true, rows, summary: { total, returned: rows.length }, truncated: total > rows.length }
}
