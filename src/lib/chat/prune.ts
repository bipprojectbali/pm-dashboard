import { prisma } from '../db'

async function pruneByType(type: string, validIdsFn: () => Promise<string[]>): Promise<number> {
  const existingDocs = await prisma.chatDocument.findMany({
    where: { type },
    select: { id: true, entityId: true },
  })
  if (existingDocs.length === 0) return 0
  const validIds = new Set(await validIdsFn())
  const toDelete = existingDocs.filter((d) => !validIds.has(d.entityId)).map((d) => d.id)
  if (toDelete.length === 0) return 0
  const { count } = await prisma.chatDocument.deleteMany({ where: { id: { in: toDelete } } })
  return count
}

export async function pruneOrphanDocs(): Promise<number> {
  const now = new Date()
  const closed180d = new Date(now.getTime() - 180 * 86_400_000)
  const archived90d = new Date(now.getTime() - 90 * 86_400_000)
  const eventCutoff = new Date(now.getTime() - 7 * 86_400_000)
  const commentCutoff = new Date(now.getTime() - 30 * 86_400_000)
  const auditCutoff = new Date(now.getTime() - 30 * 86_400_000)
  const reportCutoff = new Date(now.getTime() - 30 * 86_400_000)

  let total = 0

  total += await pruneByType('user', async () =>
    (await prisma.user.findMany({ where: { blocked: false }, select: { id: true } })).map((u) => u.id),
  )

  total += await pruneByType('task', async () =>
    (
      await prisma.task.findMany({
        where: {
          deletedAt: null,
          OR: [{ status: { notIn: ['CLOSED'] } }, { closedAt: { gte: closed180d } }],
        },
        select: { id: true },
      })
    ).map((t) => t.id),
  )

  total += await pruneByType('project', async () =>
    (
      await prisma.project.findMany({
        where: {
          AND: [
            { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
            { OR: [{ archivedAt: null }, { archivedAt: { gte: archived90d } }] },
          ],
        },
        select: { id: true },
      })
    ).map((p) => p.id),
  )

  total += await pruneByType('event', async () =>
    (await prisma.event.findMany({ where: { startsAt: { gte: eventCutoff } }, select: { id: true } })).map((e) => e.id),
  )

  total += await pruneByType('comment', async () =>
    (await prisma.taskComment.findMany({ where: { createdAt: { gte: commentCutoff } }, select: { id: true } })).map(
      (c) => c.id,
    ),
  )

  total += await pruneByType('github_project', async () =>
    (
      await prisma.project.findMany({
        where: { archivedAt: null, githubRepo: { not: null } },
        select: { id: true },
      })
    ).map((p) => p.id),
  )

  total += await pruneByType(
    'milestone',
    async () => (await prisma.projectMilestone.findMany({ select: { id: true } })).map((m) => m.id),
  )

  total += await pruneByType(
    'extension',
    async () => (await prisma.projectExtension.findMany({ select: { id: true } })).map((e) => e.id),
  )

  total += await pruneByType(
    'dependency',
    async () =>
      (await prisma.taskDependency.findMany({ select: { taskId: true }, distinct: ['taskId'] })).map((d) => d.taskId),
  )

  total += await pruneByType(
    'evidence',
    async () => (await prisma.taskEvidence.findMany({ select: { id: true } })).map((e) => e.id),
  )

  total += await pruneByType('audit_recent', async () =>
    (
      await prisma.auditLog.findMany({
        where: { action: { in: ['ROLE_CHANGED', 'BLOCKED', 'UNBLOCKED'] }, createdAt: { gte: auditCutoff } },
        select: { id: true },
      })
    ).map((a) => a.id),
  )

  total += await pruneByType('report_history', async () =>
    (await prisma.reportHistory.findMany({ where: { sentAt: { gte: reportCutoff } }, select: { id: true } })).map(
      (r) => r.id,
    ),
  )

  total += await pruneByType('project_retro', async () =>
    (
      await prisma.project.findMany({
        where: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        select: { id: true },
      })
    ).map((p) => p.id),
  )

  return total
}
