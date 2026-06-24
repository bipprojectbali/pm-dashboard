import { formatDateKeyShort } from './timezone'
import { getRecentSnapshots } from './daily-snapshot'

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

  const kpiLines = [
    `- Task open: ${today.kpi.openTasks} (${delta(today.kpi.openTasks, yesterday.kpi.openTasks)} vs kemarin, ${delta(today.kpi.openTasks, weekAgo.kpi.openTasks)} vs 7 hari lalu)`,
    `- Task overdue: ${today.kpi.overdueCount} (${delta(today.kpi.overdueCount, yesterday.kpi.overdueCount)} vs kemarin)`,
    `- Task stale: ${today.kpi.staleCount} (${delta(today.kpi.staleCount, yesterday.kpi.staleCount)} vs kemarin)`,
    `- Velocity 7h: ${today.kpi.velocity7d} (${delta(today.kpi.velocity7d, yesterday.kpi.velocity7d)} vs kemarin)`,
  ].join('\n')

  const projectDeltas = today.projects
    .map((tp) => {
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
      ]
        .filter(Boolean)
        .join(', ')
      return `- *${tp.name}*: ${tp.grade} (${tp.score}/100, ${scoreDelta} vs kemarin${weekDelta})${flags ? ` — ${flags}` : ''}`
    })
    .join('\n')

  const teamDeltas = today.team
    .map((tu) => {
      const yu = yesterday.team.find((u) => u.userId === tu.userId)
      const wu = weekAgo.team.find((u) => u.userId === tu.userId)
      if (!yu) return `- *${tu.name}*: baru aktif (${tu.open} open)`
      const flags = [
        tu.overdue > yu.overdue ? `overdue naik ${delta(tu.overdue, yu.overdue)}` : '',
        tu.overdue < yu.overdue ? `overdue turun ${delta(tu.overdue, yu.overdue)}` : '',
        tu.closed7d > yu.closed7d ? `✓ selesaikan +${tu.closed7d - yu.closed7d} task` : '',
        tu.overloaded && !yu.overloaded ? '🔴 baru overloaded' : '',
        !tu.overloaded && yu.overloaded ? '✅ tidak lagi overloaded' : '',
      ]
        .filter(Boolean)
        .join(', ')
      const weekNote = wu ? ` | 7h: open ${delta(tu.open, wu.open)}, closed ${delta(tu.closed7d, wu.closed7d)}` : ''
      return `- *${tu.name}*: ${tu.open} open, ${tu.overdue} overdue, ${tu.closed7d} closed/7h${weekNote}${flags ? ` — ${flags}` : ''}`
    })
    .join('\n')

  const velocityTrend = snapshots.map((s) => `${fmt(s.date)}: ${s.kpi.velocity7d} task/7h`).join(' → ')

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
