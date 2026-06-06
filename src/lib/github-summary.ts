import { prisma } from './db'

export interface GithubSummary {
  linked: boolean
  repo: string | null
  stats: {
    commits7d: number
    commits30d: number
    contributors30d: number
    openPrs: number
    lastPushAt: Date | null
    lastPushBy: string | null
  }
  contributors: Array<{ login: string; commits: number }>
  openPrs: Array<{ prNumber: number | null; title: string; url: string; actorLogin: string; createdAt: Date }>
  recent: Array<{
    id: string
    kind: string
    actorLogin: string
    title: string
    url: string
    sha: string | null
    prNumber: number | null
    createdAt: Date
    matchedUser: { id: string; name: string; email: string; image: string | null } | null
  }>
}

export async function computeProjectGithubSummary(projectId: string): Promise<GithubSummary | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, githubRepo: true },
  })
  if (!project) return null
  if (!project.githubRepo)
    return { linked: false, repo: null, stats: emptyStats(), contributors: [], openPrs: [], recent: [] }

  const now = Date.now()
  const day = 24 * 3600 * 1000
  const last7 = new Date(now - 7 * day)
  const last30 = new Date(now - 30 * day)

  const [commits7, commits30, contributors, openPrs, lastEvent, recentEvents, closedPrs] = await Promise.all([
    prisma.projectGithubEvent.count({
      where: { projectId, kind: 'PUSH_COMMIT', createdAt: { gte: last7 } },
    }),
    prisma.projectGithubEvent.count({
      where: { projectId, kind: 'PUSH_COMMIT', createdAt: { gte: last30 } },
    }),
    prisma.projectGithubEvent.groupBy({
      by: ['actorLogin'],
      where: { projectId, kind: 'PUSH_COMMIT', createdAt: { gte: last30 } },
      _count: { _all: true },
      orderBy: { _count: { actorLogin: 'desc' } },
      take: 8,
    }),
    prisma.projectGithubEvent.findMany({
      where: { projectId, kind: 'PR_OPENED' },
      select: { prNumber: true, title: true, url: true, actorLogin: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.projectGithubEvent.findFirst({
      where: { projectId, kind: 'PUSH_COMMIT' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorLogin: true },
    }),
    prisma.projectGithubEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { matchedUser: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.projectGithubEvent.findMany({
      where: { projectId, kind: { in: ['PR_CLOSED', 'PR_MERGED'] } },
      select: { prNumber: true },
    }),
  ])

  const closedPrNums = new Set(closedPrs.map((p) => p.prNumber).filter((n): n is number => n != null))
  const openPrList = openPrs.filter((p) => p.prNumber != null && !closedPrNums.has(p.prNumber))

  return {
    linked: true,
    repo: project.githubRepo,
    stats: {
      commits7d: commits7,
      commits30d: commits30,
      contributors30d: contributors.length,
      openPrs: openPrList.length,
      lastPushAt: lastEvent?.createdAt ?? null,
      lastPushBy: lastEvent?.actorLogin ?? null,
    },
    contributors: contributors.map((c) => ({ login: c.actorLogin, commits: c._count._all })),
    openPrs: openPrList.slice(0, 5),
    recent: recentEvents,
  }
}

function emptyStats(): GithubSummary['stats'] {
  return { commits7d: 0, commits30d: 0, contributors30d: 0, openPrs: 0, lastPushAt: null, lastPushBy: null }
}
