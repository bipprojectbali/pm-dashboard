import { prisma } from '../db'
import { WORKLOAD_KIND_FILTER } from '../task-metrics'
import type { RetroContributor, RetroGithubSummary, RetroOptions, RetroResult, RetroTaskRow } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / DAY_MS))
}

export async function computeRetro(opts: RetroOptions): Promise<RetroResult | null> {
  const { projectId } = opts
  const since = opts.since
  const until = opts.until ?? new Date()

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, status: true, endsAt: true },
  })
  if (!project) return null

  const [closedTasks, slippedTasks, blockedTasks, createdTasks, extensions, githubGroups, statusChanges] =
    await Promise.all([
      prisma.task.findMany({
        where: { ...WORKLOAD_KIND_FILTER, projectId, closedAt: { gte: since, lte: until } },
        orderBy: { closedAt: 'desc' },
        include: { assignee: { select: { id: true, email: true, name: true } } },
      }),
      prisma.task.findMany({
        where: { ...WORKLOAD_KIND_FILTER, projectId, dueAt: { gte: since, lte: until, not: null } },
        orderBy: { dueAt: 'asc' },
        include: { assignee: { select: { id: true, email: true, name: true } } },
      }),
      prisma.task.findMany({
        where: {
          ...WORKLOAD_KIND_FILTER,
          projectId,
          status: { notIn: ['CLOSED'] },
          blockedBy: { some: { blockedBy: { status: { notIn: ['CLOSED'] } } } },
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          blockedBy: { include: { blockedBy: { select: { id: true, title: true, status: true } } } },
        },
      }),
      prisma.task.count({ where: { ...WORKLOAD_KIND_FILTER, projectId, createdAt: { gte: since, lte: until } } }),
      prisma.projectExtension.findMany({
        where: { projectId, createdAt: { gte: since, lte: until } },
        orderBy: { createdAt: 'desc' },
        include: { extendedBy: { select: { name: true, email: true } } },
      }),
      prisma.projectGithubEvent.groupBy({
        by: ['kind'],
        _count: true,
        where: { projectId, createdAt: { gte: since, lte: until } },
      }),
      prisma.taskStatusChange.findMany({
        where: { task: { projectId }, createdAt: { gte: since, lte: until }, toStatus: 'CLOSED' },
        include: { author: { select: { id: true, email: true, name: true } } },
      }),
    ])

  const slippedFiltered = slippedTasks.filter(
    (t) => !t.closedAt || (t.dueAt && t.closedAt.getTime() > t.dueAt.getTime()),
  )

  const mapTask = (t: (typeof closedTasks)[number]): RetroTaskRow => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority,
    assigneeEmail: t.assignee?.email ?? null, dueAt: t.dueAt, closedAt: t.closedAt,
    estimateHours: t.estimateHours,
  })

  const shipped = closedTasks.map(mapTask)
  const slipped = slippedFiltered.map(mapTask)
  const stillBlocked = blockedTasks.map((t) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority,
    assigneeEmail: t.assignee?.email ?? null, dueAt: t.dueAt, closedAt: t.closedAt,
    estimateHours: t.estimateHours,
  }))

  const biggestMisses = slippedFiltered
    .filter((t) => t.dueAt && t.dueAt < until)
    .map((t) => ({ ...mapTask(t), daysOverDue: t.dueAt ? daysBetween(t.closedAt ?? until, t.dueAt) : 0 }))
    .sort((a, b) => b.daysOverDue - a.daysOverDue)
    .slice(0, 5)

  const github: RetroGithubSummary = { commits: 0, prsOpened: 0, prsMerged: 0, prsClosed: 0, reviews: 0 }
  for (const g of githubGroups) {
    if (g.kind === 'PUSH_COMMIT') github.commits = g._count
    else if (g.kind === 'PR_OPENED') github.prsOpened = g._count
    else if (g.kind === 'PR_MERGED') github.prsMerged = g._count
    else if (g.kind === 'PR_CLOSED') github.prsClosed = g._count
    else if (g.kind === 'PR_REVIEWED') github.reviews = g._count
  }

  const contribMap = new Map<string | null, RetroContributor>()
  const bumpContrib = (userId: string | null, email: string | null, name: string | null) => {
    if (!contribMap.has(userId)) contribMap.set(userId, { userId, email, name, closed: 0, commits: 0, prsMerged: 0 })
    return contribMap.get(userId)!
  }
  for (const t of closedTasks) {
    if (t.assignee) bumpContrib(t.assignee.id, t.assignee.email, t.assignee.name).closed += 1
  }
  for (const sc of statusChanges) {
    if (!sc.author) continue
    const row = bumpContrib(sc.author.id, sc.author.email, sc.author.name)
    if (!closedTasks.some((t) => t.assignee?.id === sc.author?.id && t.id === sc.taskId)) row.closed += 1
  }

  const ghByUser = await prisma.projectGithubEvent.groupBy({
    by: ['matchedUserId', 'kind'],
    _count: true,
    where: { projectId, createdAt: { gte: since, lte: until }, matchedUserId: { not: null }, kind: { in: ['PUSH_COMMIT', 'PR_MERGED'] } },
  })
  const ghUserIds = [...new Set(ghByUser.map((g) => g.matchedUserId).filter((v): v is string => !!v))]
  const ghUsers = ghUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: ghUserIds } }, select: { id: true, email: true, name: true } })
    : []
  const ghUserById = new Map(ghUsers.map((u) => [u.id, u]))
  for (const g of ghByUser) {
    if (!g.matchedUserId) continue
    const u = ghUserById.get(g.matchedUserId)
    const row = bumpContrib(g.matchedUserId, u?.email ?? null, u?.name ?? null)
    if (g.kind === 'PUSH_COMMIT') row.commits += g._count
    if (g.kind === 'PR_MERGED') row.prsMerged += g._count
  }

  const contributors = [...contribMap.values()]
    .filter((c) => c.closed + c.commits + c.prsMerged > 0)
    .sort((a, b) => b.closed + b.prsMerged * 2 - (a.closed + a.prsMerged * 2))
    .slice(0, 10)

  const estimateHoursClosed = Math.round(closedTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0) * 10) / 10

  return {
    project,
    window: { since, until, days: Math.max(1, Math.round((until.getTime() - since.getTime()) / DAY_MS)) },
    summary: { closed: shipped.length, slipped: slipped.length, stillBlocked: stillBlocked.length, extensions: extensions.length, newTasks: createdTasks, estimateHoursClosed },
    shipped, slipped, stillBlocked, biggestMisses,
    extensions: extensions.map((e) => ({ id: e.id, previousEndAt: e.previousEndAt, newEndAt: e.newEndAt, reason: e.reason, extendedBy: e.extendedBy?.email ?? null, createdAt: e.createdAt })),
    github,
    contributors,
  }
}
