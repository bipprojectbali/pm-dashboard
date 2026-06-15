import { z } from 'zod'
import { prisma } from '../db'
import { computeProjectGithubSummary } from '../github-summary'
import { MAX_ROWS, MAX_WINDOW_DAYS, type ToolResult } from './types'

export const QueryGithubInput = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  actorLogin: z.string().optional(),
  sinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

export async function runQueryGithub(input: z.infer<typeof QueryGithubInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const sinceDays = input.sinceDays ?? 7
  const since = new Date(Date.now() - sinceDays * 86_400_000)

  if (input.projectId || input.projectName) {
    let projectId = input.projectId
    if (!projectId && input.projectName) {
      const p = await prisma.project.findFirst({
        where: { name: { contains: input.projectName, mode: 'insensitive' } },
        select: { id: true },
      })
      projectId = p?.id
      if (!projectId) return { ok: true, rows: [], summary: { note: 'Proyek tidak ditemukan' } }
    }
    const summary = await computeProjectGithubSummary(projectId!)
    if (!summary?.linked) {
      return { ok: true, rows: [], summary: { note: 'Proyek belum terhubung ke GitHub repo' } }
    }
    return {
      ok: true,
      rows: summary.recent.slice(0, limit).map((e) => ({
        kind: e.kind, actor: e.matchedUser?.name ?? e.actorLogin,
        title: e.title, url: e.url, prNumber: e.prNumber, createdAt: e.createdAt,
      })),
      summary: {
        repo: summary.repo, commits7d: summary.stats.commits7d, commits30d: summary.stats.commits30d,
        contributors30d: summary.stats.contributors30d, openPrs: summary.stats.openPrs,
        topContributors: summary.contributors.slice(0, 10),
      },
    }
  }

  if (input.actorLogin) {
    const events = await prisma.projectGithubEvent.findMany({
      where: { actorLogin: input.actorLogin, kind: 'PUSH_COMMIT', createdAt: { gte: since } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    const byProject = new Map<string, number>()
    for (const e of events) byProject.set(e.project.name, (byProject.get(e.project.name) ?? 0) + 1)
    return {
      ok: true,
      rows: events.map((e) => ({ kind: e.kind, project: e.project.name, title: e.title, url: e.url, createdAt: e.createdAt })),
      summary: { actorLogin: input.actorLogin, sinceDays, totalCommits: events.length, byProject: Object.fromEntries(byProject) },
    }
  }

  const contributors = await prisma.projectGithubEvent.groupBy({
    by: ['actorLogin'],
    where: { kind: 'PUSH_COMMIT', createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { actorLogin: 'desc' } },
    take: limit,
  })
  return {
    ok: true,
    rows: contributors.map((c) => ({ actorLogin: c.actorLogin, commits: c._count._all })),
    summary: { sinceDays, scope: 'global' },
  }
}
