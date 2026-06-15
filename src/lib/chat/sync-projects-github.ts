import { prisma } from '../db'
import { isExtensionEnabled } from '../extensions'
import { computeProjectGithubSummary } from '../github-summary'
import { type SyncCtx, upsertDoc, fmtDate } from './upsert'

export async function syncProjects(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters, since, now } = ctx
  const projects = await prisma.project.findMany({
    where: {
      archivedAt: null,
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      owner: { select: { name: true, email: true } },
      members: { include: { user: { select: { name: true, email: true } } } },
      milestones: { where: { dueAt: { gte: now } }, take: 3, orderBy: { dueAt: 'asc' } },
      _count: { select: { tasks: true } },
    },
  })

  for (const p of projects) {
    const memberLines = p.members
      .slice(0, 10)
      .map((m) => `${m.user.name} (${m.role})`)
      .join(', ')
    const milestoneLines = p.milestones.map((m) => `  - ${m.title}: ${fmtDate(m.dueAt ?? null)}`).join('\n')
    const isPastDue = p.endsAt && new Date(p.endsAt) < now

    const content = [
      `[PROJECT] ${p.name} — ${p.status}`,
      `Owner: ${p.owner.name} (${p.owner.email})`,
      `Priority: ${p.priority}`,
      p.endsAt ? `Deadline: ${fmtDate(p.endsAt)}${isPastDue ? ' ⚠️ LEWAT DEADLINE' : ''}` : 'Deadline: tidak ada',
      memberLines ? `Anggota tim: ${memberLines}` : null,
      p.description ? `Deskripsi: ${p.description.slice(0, 300)}` : null,
      p.milestones.length > 0 ? `Milestone mendatang:\n${milestoneLines}` : null,
      p.githubRepo ? `GitHub: ${p.githubRepo}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'project', entityId: p.id, title: p.name, content, tags: p.status.toLowerCase(), projectId: p.id },
      embSettings,
      counters,
    )
  }
}

export async function syncGithub(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters } = ctx
  const githubExtensionOn = await isExtensionEnabled('github')
  const projectsWithRepo = githubExtensionOn
    ? await prisma.project.findMany({
        where: { archivedAt: null, githubRepo: { not: null } },
        select: { id: true, name: true },
      })
    : []

  for (const p of projectsWithRepo) {
    const summary = await computeProjectGithubSummary(p.id)
    if (!summary?.linked) continue
    const top = summary.contributors
      .slice(0, 5)
      .map((c) => `${c.login} (${c.commits})`)
      .join(', ')
    const openLines = summary.openPrs
      .slice(0, 5)
      .map((pr) => `  - #${pr.prNumber} ${pr.title} (${pr.actorLogin})`)
      .join('\n')
    const recent = summary.recent
      .slice(0, 8)
      .map((e) => `  - ${e.kind} oleh ${e.matchedUser?.name ?? e.actorLogin}: ${e.title.slice(0, 80)}`)
      .join('\n')

    const content = [
      `[GITHUB] ${p.name} — repo: ${summary.repo}`,
      `Stats 30h: ${summary.stats.commits30d} commit, ${summary.stats.contributors30d} kontributor`,
      `Stats 7h: ${summary.stats.commits7d} commit`,
      `Open PR: ${summary.stats.openPrs}`,
      summary.stats.lastPushAt
        ? `Push terakhir: ${fmtDate(summary.stats.lastPushAt)} oleh ${summary.stats.lastPushBy}`
        : null,
      top ? `Top kontributor: ${top}` : null,
      openLines ? `PR open:\n${openLines}` : null,
      recent ? `Aktivitas terkini:\n${recent}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'github_project', entityId: p.id, title: `GitHub: ${p.name}`, content, tags: 'github', projectId: p.id },
      embSettings,
      counters,
    )
  }
}
