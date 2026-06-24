import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from '../admin-overview'
import { prisma } from '../db'

async function countOpenPrs(): Promise<number> {
  const [opened, closed] = await Promise.all([
    prisma.projectGithubEvent.findMany({ where: { kind: 'PR_OPENED' }, select: { projectId: true, prNumber: true } }),
    prisma.projectGithubEvent.findMany({ where: { kind: { in: ['PR_CLOSED', 'PR_MERGED'] } }, select: { projectId: true, prNumber: true } }),
  ])
  const closedKey = new Set(closed.filter((c) => c.prNumber != null).map((c) => `${c.projectId}:${c.prNumber}`))
  return opened.filter((o) => o.prNumber != null && !closedKey.has(`${o.projectId}:${o.prNumber}`)).length
}

export async function fetchContextData(now: Date, since7d: Date, since30d: Date) {
  const [overview, health, load, risk, events, recentActivity, topOverdue] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 20 }),
    computeTeamLoad({ includeUnassigned: false, limit: 30 }),
    computeRiskReport(),
    prisma.event.findMany({
      where: { startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      include: { tags: { include: { tag: { select: { name: true } } } } },
    }),
    Promise.all([
      prisma.taskStatusChange.findMany({
        where: { createdAt: { gte: since7d } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          task: { select: { title: true, project: { select: { name: true } } } },
          author: { select: { name: true } },
        },
      }),
      prisma.taskComment.findMany({
        where: { createdAt: { gte: since7d } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          task: { select: { title: true, project: { select: { name: true } } } },
          author: { select: { name: true } },
        },
      }),
    ]),
    prisma.task.findMany({
      where: { status: { notIn: ['CLOSED'] }, dueAt: { lt: now }, priority: { in: ['CRITICAL', 'HIGH'] }, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
      take: 10,
      include: { assignee: { select: { name: true } }, project: { select: { name: true } } },
    }),
  ])

  const allUsers = await prisma.user.findMany({
    where: { blocked: false },
    include: {
      projectMemberships: { select: { projectId: true, role: true } },
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, dueAt: true, priority: true, estimateHours: true },
      },
      _count: {
        select: { assignedTasks: { where: { status: 'CLOSED', closedAt: { gte: since30d }, deletedAt: null } } },
      },
    },
  })

  const activeProjects = health.projects.filter((p) => p.status === 'ACTIVE')
  const activeProjectIds = activeProjects.map((p) => p.id)

  const projectMembers = activeProjectIds.length
    ? await prisma.projectMember.findMany({
        where: { projectId: { in: activeProjectIds } },
        include: { user: { select: { name: true } } },
        orderBy: { joinedAt: 'asc' },
      })
    : []
  const membersByProject = new Map<string, Array<{ name: string; role: string }>>()
  for (const m of projectMembers) {
    const list = membersByProject.get(m.projectId) ?? []
    list.push({ name: m.user.name, role: m.role })
    membersByProject.set(m.projectId, list)
  }

  const [githubCommits7d, githubByProject, topContributors7d, openPrCount] = await Promise.all([
    prisma.projectGithubEvent.count({ where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } } }),
    prisma.projectGithubEvent.groupBy({
      by: ['projectId'],
      where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } },
      _count: { _all: true },
      orderBy: { _count: { projectId: 'desc' } },
      take: 5,
    }),
    prisma.projectGithubEvent.groupBy({
      by: ['actorLogin'],
      where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } },
      _count: { _all: true },
      orderBy: { _count: { actorLogin: 'desc' } },
      take: 5,
    }),
    countOpenPrs(),
  ])

  const ghProjectIds = githubByProject.map((g) => g.projectId)
  const ghProjectNames = ghProjectIds.length
    ? await prisma.project.findMany({ where: { id: { in: ghProjectIds } }, select: { id: true, name: true } })
    : []
  const ghNameMap = new Map(ghProjectNames.map((p) => [p.id, p.name]))

  const [statusChanges, comments] = recentActivity

  return {
    overview, health, load, risk, events,
    statusChanges, comments, topOverdue,
    allUsers, activeProjects, membersByProject,
    githubCommits7d, githubByProject, topContributors7d, openPrCount, ghNameMap,
  }
}
