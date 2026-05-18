import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { prisma } from './db'
import { formatDateKeyShort, getReportTimezone, getZonedDateKey } from './timezone'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SnapshotKpi {
  totalTasks: number
  openTasks: number
  closedToday: number
  overdueCount: number
  staleCount: number
  velocity7d: number
  totalProjects: number
  activeProjects: number
}

export interface SnapshotProject {
  id: string
  name: string
  status: string
  score: number
  grade: string
  openTasks: number
  overdueTasks: number
  blockedTasks: number
  daysUntilDue: number | null
  pastDue: boolean
}

export interface SnapshotTeamMember {
  userId: string
  name: string
  open: number
  overdue: number
  closed7d: number
  estimateHours: number
  overloaded: boolean
}

export interface SnapshotRisks {
  severity: string
  pastDueProjects: number
  overdueTasks: number
  staleTasks: number
  offlineAgents: number
  pendingAgents: number
}

export interface DailySnapshotData {
  id: string
  date: Date
  kpi: SnapshotKpi
  projects: SnapshotProject[]
  team: SnapshotTeamMember[]
  risks: SnapshotRisks
  createdAt: Date
}

// ─── Capture ─────────────────────────────────────────────────────────────────

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
    openTasks: (overview.tasks.byStatus['OPEN'] ?? 0) + (overview.tasks.byStatus['IN_PROGRESS'] ?? 0) + (overview.tasks.byStatus['READY_FOR_QC'] ?? 0) + (overview.tasks.byStatus['REOPENED'] ?? 0),
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
    offlineAgents: risk.summary.offlineAgents,
    pendingAgents: risk.summary.pendingAgents,
  }

  const snapshot = await prisma.dailySnapshot.upsert({
    where: { date: dateKey },
    create: { date: dateKey, kpi: kpi as object, projects: projects as object[], team: team as object[], risks: risks as object },
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

// ─── Query ───────────────────────────────────────────────────────────────────

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

// ─── Delta context for AI prompt ─────────────────────────────────────────────

export async function buildSnapshotContext(): Promise<string> {
  const snapshots = await getRecentSnapshots(8)
  if (snapshots.length < 2) return ''

  const today = snapshots[snapshots.length - 1]
  const yesterday = snapshots[snapshots.length - 2]
  const weekAgo = snapshots[0]

  const fmt = (d: Date) => formatDateKeyShort(d)

  const delta = (a: number, b: number) => {
    const d = a - b
    if (d === 0) return '±0'
    return d > 0 ? `+${d}` : `${d}`
  }

  // KPI delta
  const kpiLines = [
    `- Task open: ${today.kpi.openTasks} (${delta(today.kpi.openTasks, yesterday.kpi.openTasks)} vs kemarin, ${delta(today.kpi.openTasks, weekAgo.kpi.openTasks)} vs 7 hari lalu)`,
    `- Task overdue: ${today.kpi.overdueCount} (${delta(today.kpi.overdueCount, yesterday.kpi.overdueCount)} vs kemarin)`,
    `- Task stale: ${today.kpi.staleCount} (${delta(today.kpi.staleCount, yesterday.kpi.staleCount)} vs kemarin)`,
    `- Velocity 7h: ${today.kpi.velocity7d} (${delta(today.kpi.velocity7d, yesterday.kpi.velocity7d)} vs kemarin)`,
  ].join('\n')

  // Project delta
  const projectDeltas = today.projects.map((tp) => {
    const yp = yesterday.projects.find((p) => p.id === tp.id)
    const wp = weekAgo.projects.find((p) => p.id === tp.id)
    if (!yp) return `- *${tp.name}*: baru muncul (skor ${tp.grade}/${tp.score})`
    const scoreDelta = delta(tp.score, yp.score)
    const weekDelta = wp ? ` | vs 7h: skor ${delta(tp.score, wp.score)}` : ''
    const flags = [
      tp.overdueTasks > yp.overdueTasks ? `⚠ overdue +${tp.overdueTasks - yp.overdueTasks}` : '',
      tp.overdueTasks < yp.overdueTasks ? `✓ overdue ${tp.overdueTasks - yp.overdueTasks}` : '',
      tp.blockedTasks > 0 ? `🔒 ${tp.blockedTasks} blocked` : '',
      tp.pastDue ? '❌ PAST DUE' : '',
    ].filter(Boolean).join(', ')
    return `- *${tp.name}*: ${tp.grade} (${tp.score}/100, ${scoreDelta} vs kemarin${weekDelta})${flags ? ' — ' + flags : ''}`
  }).join('\n')

  // Team delta
  const teamDeltas = today.team.map((tu) => {
    const yu = yesterday.team.find((u) => u.userId === tu.userId)
    const wu = weekAgo.team.find((u) => u.userId === tu.userId)
    if (!yu) return `- *${tu.name}*: baru aktif (${tu.open} open)`
    const flags = [
      tu.overdue > yu.overdue ? `overdue naik ${delta(tu.overdue, yu.overdue)}` : '',
      tu.overdue < yu.overdue ? `overdue turun ${delta(tu.overdue, yu.overdue)}` : '',
      tu.closed7d > yu.closed7d ? `✓ selesaikan +${tu.closed7d - yu.closed7d} task` : '',
      tu.overloaded && !yu.overloaded ? '🔴 baru overloaded' : '',
      !tu.overloaded && yu.overloaded ? '✅ tidak lagi overloaded' : '',
    ].filter(Boolean).join(', ')
    const weekNote = wu ? ` | 7h: open ${delta(tu.open, wu.open)}, closed ${delta(tu.closed7d, wu.closed7d)}` : ''
    return `- *${tu.name}*: ${tu.open} open, ${tu.overdue} overdue, ${tu.closed7d} closed/7h${weekNote}${flags ? ' — ' + flags : ''}`
  }).join('\n')

  // Velocity trend
  const velocityTrend = snapshots
    .map((s) => `${fmt(s.date)}: ${s.kpi.velocity7d} task/7h`)
    .join(' → ')

  return `
═══ KONTEKS HISTORIS ═══
Data perbandingan ${fmt(weekAgo.date)} → ${fmt(yesterday.date)} → hari ini (${fmt(today.date)})

📊 DELTA KPI (hari ini vs kemarin vs 7 hari lalu):
${kpiLines}

📈 TREND VELOCITY:
${velocityTrend}

🏗 DELTA PROJECT (${today.projects.length} project aktif):
${projectDeltas || '- Tidak ada data project'}

👥 DELTA TIM (${today.team.length} anggota):
${teamDeltas || '- Tidak ada data tim'}

Gunakan data historis ini untuk analisis tren, bukan hanya kondisi hari ini. Sebutkan nama spesifik user/project yang mengalami perubahan signifikan.`
}
