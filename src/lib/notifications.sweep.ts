// Due-soon / overdue notification sweep, run periodically by the server entry.
// Dedupes per (recipient, task, kind) within the window so a task isn't
// re-notified every tick. Re-exported from notifications.ts.
import { prisma } from './db'
import { createNotification } from './notifications.core'

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000

export async function runDueSoonSweep(): Promise<{ dueSoon: number; overdue: number }> {
  const now = new Date()
  const soon = new Date(now.getTime() + DUE_SOON_WINDOW_MS)

  const dueSoonTasks = await prisma.task.findMany({
    where: {
      assigneeId: { not: null },
      status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      dueAt: { gte: now, lte: soon },
    },
    select: { id: true, title: true, projectId: true, assigneeId: true, dueAt: true },
  })

  const overdueTasks = await prisma.task.findMany({
    where: {
      assigneeId: { not: null },
      status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
      dueAt: { lt: now },
    },
    select: { id: true, title: true, projectId: true, assigneeId: true, dueAt: true },
  })

  let dueSoonCount = 0
  let overdueCount = 0

  for (const t of dueSoonTasks) {
    if (!t.assigneeId) continue
    const already = await prisma.notification.findFirst({
      where: {
        recipientId: t.assigneeId,
        taskId: t.id,
        kind: 'TASK_DUE_SOON',
        createdAt: { gt: new Date(now.getTime() - DUE_SOON_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (already) continue
    await createNotification({
      recipientId: t.assigneeId,
      kind: 'TASK_DUE_SOON',
      taskId: t.id,
      projectId: t.projectId,
      title: `"${t.title}" is due soon`,
      body: t.dueAt ? `Due ${t.dueAt.toLocaleString()}` : null,
    })
    dueSoonCount++
  }

  for (const t of overdueTasks) {
    if (!t.assigneeId) continue
    const already = await prisma.notification.findFirst({
      where: {
        recipientId: t.assigneeId,
        taskId: t.id,
        kind: 'TASK_OVERDUE',
        createdAt: { gt: new Date(now.getTime() - DUE_SOON_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (already) continue
    await createNotification({
      recipientId: t.assigneeId,
      kind: 'TASK_OVERDUE',
      taskId: t.id,
      projectId: t.projectId,
      title: `"${t.title}" is overdue`,
      body: t.dueAt ? `Was due ${t.dueAt.toLocaleString()}` : null,
    })
    overdueCount++
  }

  return { dueSoon: dueSoonCount, overdue: overdueCount }
}
