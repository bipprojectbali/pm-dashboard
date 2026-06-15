import { z } from 'zod'
import { prisma } from '../db'
import { MAX_ROWS, MAX_WINDOW_DAYS, type ToolResult } from './types'

export const QueryEffortInput = z.object({
  mode: z.enum(['task', 'user', 'overbudget']),
  taskId: z.string().optional(),
  verdict: z.enum(['over', 'under', 'on', 'missing-estimate', 'no-assignee', 'no-activity']).optional(),
  sinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

// Compute actual hours from task timeline (closedAt - startsAt|createdAt)
function computeActualHours(task: { startsAt: Date | null; closedAt: Date | null; createdAt: Date }): number | null {
  if (!task.closedAt) return null
  const start = (task.startsAt ?? task.createdAt).getTime()
  const end = task.closedAt.getTime()
  if (end <= start) return 0
  return Math.round(((end - start) / 3_600_000) * 100) / 100
}

function verdictFor(estimateHours: number | null, actualHours: number | null, assigneeId: string | null) {
  if (!assigneeId) return 'no-assignee'
  if (actualHours === null) return 'no-activity'
  if (estimateHours === null) return 'missing-estimate'
  const pct = (actualHours - estimateHours) / estimateHours
  if (pct > 0.25) return 'over'
  if (pct < -0.25) return 'under'
  return 'on'
}

export async function runQueryEffort(input: z.infer<typeof QueryEffortInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20

  if (input.mode === 'task') {
    if (!input.taskId) return { ok: false, error: 'taskId wajib untuk mode=task' }
    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      select: { id: true, title: true, status: true, assigneeId: true, estimateHours: true, startsAt: true, closedAt: true, createdAt: true },
    })
    if (!task) return { ok: true, rows: [], summary: { note: 'Task tidak ditemukan' } }
    const actualHours = computeActualHours(task)
    const verdict = verdictFor(task.estimateHours, actualHours, task.assigneeId)
    return { ok: true, rows: [{ taskId: task.id, title: task.title, status: task.status, estimateHours: task.estimateHours, actualHours, verdict }] }
  }

  if (input.mode === 'user') {
    // Per-user summary: open task count + total estimate hours
    const since = input.sinceDays ? new Date(Date.now() - input.sinceDays * 86_400_000) : undefined
    const assignments = await prisma.task.groupBy({
      by: ['assigneeId'],
      where: {
        assigneeId: { not: null },
        status: { not: 'CLOSED' },
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      _count: { _all: true },
      _sum: { estimateHours: true },
      orderBy: { _count: { assigneeId: 'desc' } },
      take: limit,
    })
    const userIds = assignments.map((a) => a.assigneeId!).filter(Boolean)
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : []
    const emailById = new Map(users.map((u) => [u.id, u.email]))
    const rows = assignments.map((a) => ({
      userId: a.assigneeId,
      email: emailById.get(a.assigneeId!) ?? '(unknown)',
      openTaskCount: a._count._all,
      totalEstimateHours: a._sum.estimateHours ?? 0,
      // pm-watch data not available — actualHours requires ActivityEvent model
      actualHours: null,
      phantomHours: null,
    }))
    return { ok: true, rows, summary: { count: rows.length, note: 'pm-watch data tidak tersedia di environment ini' } }
  }

  // mode=overbudget — tasks where closedAt-based actual > estimate * 1.25
  const targetVerdict = input.verdict ?? 'over'
  const tasks = await prisma.task.findMany({
    where: { status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
    take: limit * 3,
    select: {
      id: true, title: true, status: true, priority: true, projectId: true,
      assigneeId: true, estimateHours: true, startsAt: true, closedAt: true, createdAt: true,
      project: { select: { name: true } },
      assignee: { select: { email: true } },
    },
  })
  const rows = tasks
    .map((t) => {
      const actualHours = computeActualHours(t)
      return { taskId: t.id, title: t.title, status: t.status, priority: t.priority, projectId: t.projectId, projectName: t.project.name, assigneeEmail: t.assignee?.email ?? null, estimateHours: t.estimateHours, actualHours, verdict: verdictFor(t.estimateHours, actualHours, t.assigneeId) }
    })
    .filter((r) => r.verdict === targetVerdict)
    .slice(0, limit)
  return { ok: true, rows, truncated: rows.length === limit, summary: { count: rows.length, verdict: targetVerdict } }
}
