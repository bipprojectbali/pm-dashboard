import { z } from 'zod'
import { prisma } from '../db'
import { MAX_ROWS, MAX_WINDOW_DAYS, type ToolResult } from './types'

export const QueryTasksInput = z.object({
  mode: z.enum(['list', 'aggregate']),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  assigneeEmail: z.string().optional(),
  assigneeName: z.string().optional(),
  status: z.array(z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).optional(),
  kind: z.array(z.enum(['TASK', 'BUG', 'QC'])).optional(),
  overdueOnly: z.boolean().optional(),
  createdSinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  closedSinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  groupBy: z.enum(['status', 'priority', 'kind', 'assignee', 'project']).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

export async function runQueryTasks(input: z.infer<typeof QueryTasksInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const now = new Date()

  let projectId = input.projectId
  if (!projectId && input.projectName) {
    const p = await prisma.project.findFirst({
      where: { name: { contains: input.projectName, mode: 'insensitive' } },
      select: { id: true },
    })
    projectId = p?.id
    if (!projectId)
      return { ok: true, rows: [], summary: { total: 0, note: `Proyek "${input.projectName}" tidak ditemukan` } }
  }

  let assigneeId: string | undefined
  if (input.assigneeEmail || input.assigneeName) {
    const a = await prisma.user.findFirst({
      where: input.assigneeEmail
        ? { email: input.assigneeEmail }
        : { name: { contains: input.assigneeName!, mode: 'insensitive' } },
      select: { id: true },
    })
    assigneeId = a?.id
    if (!assigneeId)
      return { ok: true, rows: [], summary: { total: 0, note: `User "${input.assigneeEmail ?? input.assigneeName}" tidak ditemukan` } }
  }

  const where: Record<string, unknown> = { deletedAt: null }
  if (projectId) where.projectId = projectId
  if (assigneeId) where.assigneeId = assigneeId
  if (input.status?.length) where.status = { in: input.status }
  if (input.priority?.length) where.priority = { in: input.priority }
  if (input.kind?.length) where.kind = { in: input.kind }
  if (input.overdueOnly) { where.status = { notIn: ['CLOSED'] }; where.dueAt = { lt: now } }
  if (input.createdSinceDays) where.createdAt = { gte: new Date(now.getTime() - input.createdSinceDays * 86_400_000) }
  if (input.closedSinceDays) where.closedAt = { gte: new Date(now.getTime() - input.closedSinceDays * 86_400_000) }

  const total = await prisma.task.count({ where })

  if (input.mode === 'aggregate') {
    const all = await prisma.task.findMany({
      where,
      select: {
        status: true, priority: true, kind: true, estimateHours: true,
        assignee: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    })
    const sumEstimate = all.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    const counts: Record<string, { count: number; sumEstimateHours: number }> = {}
    const groupKey = (t: (typeof all)[number]): string => {
      switch (input.groupBy) {
        case 'status': return t.status
        case 'priority': return t.priority
        case 'kind': return t.kind
        case 'assignee': return t.assignee?.email ?? '(unassigned)'
        case 'project': return t.project?.name ?? '?'
        default: return '_total'
      }
    }
    for (const t of all) {
      const k = groupKey(t)
      const bucket = counts[k] ?? { count: 0, sumEstimateHours: 0 }
      bucket.count += 1
      bucket.sumEstimateHours += t.estimateHours ?? 0
      counts[k] = bucket
    }
    const rows = Object.entries(counts)
      .map(([key, v]) => ({ key, count: v.count, sumEstimateHours: Math.round(v.sumEstimateHours * 10) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
    return { ok: true, rows, summary: { total, sumEstimateHours: Math.round(sumEstimate * 10) / 10, groupBy: input.groupBy ?? '_total' } }
  }

  const tasks = await prisma.task.findMany({
    where,
    take: limit,
    orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    include: {
      assignee: { select: { name: true, email: true } },
      project: { select: { name: true } },
    },
  })
  const rows = tasks.map((t) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, kind: t.kind,
    project: t.project?.name ?? null, assignee: t.assignee?.email ?? null,
    dueAt: t.dueAt, estimateHours: t.estimateHours,
    overdue: t.dueAt ? new Date(t.dueAt) < now && t.status !== 'CLOSED' : false,
  }))
  return { ok: true, rows, summary: { total, returned: rows.length }, truncated: total > rows.length }
}
