import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { prisma } from './db'
import { getReportTimezone, getZonedDateKey } from './timezone'
import type { DailySnapshotData, SnapshotKpi, SnapshotProject, SnapshotRisks, SnapshotTeamMember } from './daily-snapshot.types'

export type { DailySnapshotData, SnapshotKpi, SnapshotProject, SnapshotRisks, SnapshotTeamMember } from './daily-snapshot.types'

export async function captureSnapshot(): Promise<DailySnapshotData> {
  const [overview, health, load, risk] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 100 }),
    computeTeamLoad({ includeUnassigned: false, limit: 50 }),
    computeRiskReport(),
  ])

  // midnight of report timezone stored as UTC
  const tz = await getReportTimezone()
  const dateKey = getZonedDateKey(tz)

  const kpi: SnapshotKpi = {
    totalTasks: overview.tasks.total,
    openTasks:
      (overview.tasks.byStatus.OPEN ?? 0) +
      (overview.tasks.byStatus.IN_PROGRESS ?? 0) +
      (overview.tasks.byStatus.READY_FOR_QC ?? 0) +
      (overview.tasks.byStatus.REOPENED ?? 0),
    closedToday: overview.tasks.closed7d,
    overdueCount: overview.tasks.overdueOpen,
    staleCount: overview.tasks.staleInProgress,
    velocity7d: overview.velocity.closed7d,
    totalProjects: Object.values(overview.projects.byStatus as Record<string, number>).reduce((a, b) => a + b, 0),
    activeProjects: overview.projects.active,
  }

  const projects: SnapshotProject[] = health.projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    score: p.score,
    grade: p.grade,
    openTasks: p.openTasks,
    overdueTasks: p.overdueTasks,
    blockedTasks: p.blockedTasks,
    daysUntilDue: p.daysUntilDue ?? null,
    pastDue: p.pastDue,
  }))

  const team: SnapshotTeamMember[] = load.rows
    .filter((u) => u.userId !== null)
    .map((u) => ({
      userId: u.userId as string,
      name: u.name,
      open: u.open,
      overdue: u.overdue,
      closed7d: u.closed7d,
      estimateHours: u.estimateHours,
      overloaded: u.overloaded,
    }))

  const risks: SnapshotRisks = {
    severity: risk.severity,
    pastDueProjects: risk.summary.pastDueProjects,
    overdueTasks: risk.summary.overdueTasks,
    staleTasks: risk.summary.staleTasks,
  }

  const snapshot = await prisma.dailySnapshot.upsert({
    where: { date: dateKey },
    create: {
      date: dateKey,
      kpi: kpi as object,
      projects: projects as object[],
      team: team as object[],
      risks: risks as object,
    },
    update: { kpi: kpi as object, projects: projects as object[], team: team as object[], risks: risks as object },
  })

  return {
    ...snapshot,
    kpi: snapshot.kpi as unknown as SnapshotKpi,
    projects: snapshot.projects as unknown as SnapshotProject[],
    team: snapshot.team as unknown as SnapshotTeamMember[],
    risks: snapshot.risks as unknown as SnapshotRisks,
  }
}

export async function getRecentSnapshots(days = 7): Promise<DailySnapshotData[]> {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await prisma.dailySnapshot.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
  })
  return rows.map((s) => ({
    ...s,
    kpi: s.kpi as unknown as SnapshotKpi,
    projects: s.projects as unknown as SnapshotProject[],
    team: s.team as unknown as SnapshotTeamMember[],
    risks: s.risks as unknown as SnapshotRisks,
  }))
}
