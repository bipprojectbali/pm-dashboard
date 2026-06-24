import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { getSetting } from './app-settings'
import { buildSnapshotContext } from './daily-snapshot.context'
import { formatZonedDateLong, getReportTimezone } from './timezone'

export const DEFAULT_REPORT_INSTRUCTION = `Tulis laporan manajemen harian dalam *bahasa Indonesia*. Format: Telegram Markdown (*bold*, _italic_). Padat, berbasis data, tanpa narasi berlebihan.

Struktur wajib:

*📊 Laporan Harian — {TANGGAL}*
[1 kalimat status keseluruhan: jumlah task aktif, velocity, level risiko]

*Ringkasan Metrik*
• Total task open: X | Overdue: X | Closed 7h: X | Stale: X
• Velocity minggu ini: X task/minggu
• Risiko: [NONE/LOW/MEDIUM/HIGH]

*Status Project* (hanya project ACTIVE)
Untuk setiap project: nama, grade (A–F), skor, open/overdue/blocked, sisa hari. Satu baris per project.

*Performa Tim*
Untuk setiap anggota: nama, open task, overdue, closed 7h. Tandai OVERLOADED jika relevan. Satu baris per orang.

*Tindakan Diperlukan* (maks 3 poin)
Hanya item yang membutuhkan keputusan atau eskalasi — disertai angka dan deadline konkret.

*Tanggapan & Analisis*
Penilaian singkat kondisi hari ini: apa yang berjalan baik, apa yang mengkhawatirkan, pola atau tren yang perlu diperhatikan. Berbasis angka, bukan opini umum.

*Rangkuman Eksekutif*
3–5 poin ringkas kondisi keseluruhan tim dan project. Cocok dibaca dalam 30 detik.

*Saran*
Rekomendasi konkret berbasis data — maks 3 item, masing-masing dengan alasan singkat dan metrik pendukung.

*Tindakan Segera*
Daftar aksi spesifik yang harus diambil besok, dengan penanggung jawab (jika ada dari data tim) dan target waktu.

_pm-dashboard AI report_`

export async function buildReportPrompt(): Promise<string> {
  const [overview, health, load, risk, customInstruction, snapshotContext] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 50 }),
    computeTeamLoad({ includeUnassigned: false, limit: 30 }),
    computeRiskReport(),
    getSetting('report.promptInstruction'),
    buildSnapshotContext(),
  ])

  const tz = await getReportTimezone()
  const tanggal = formatZonedDateLong(tz)

  const activeProjects = health.projects.filter((p) => p.status === 'ACTIVE')
  const projectLines = activeProjects
    .map(
      (p) =>
        `- *${p.name}* (${p.grade}, skor ${p.score}/100): ${p.openTasks} task open, ${p.overdueTasks} overdue` +
        (p.daysUntilDue != null ? `, ${p.daysUntilDue} hari tersisa` : ', tanpa deadline') +
        (p.pastDue ? ' ⚠️ LEWAT DEADLINE' : '') +
        (p.blockedTasks > 0 ? `, ${p.blockedTasks} diblokir` : ''),
    )
    .join('\n')

  const userLines = load.rows
    .map(
      (u) =>
        `- *${u.name}*: ${u.open} open, ${u.overdue} overdue, ${u.closed7d} selesai 7h` +
        (u.overloaded ? ' 🔴 OVERLOADED' : ''),
    )
    .join('\n')

  const riskLines =
    [
      risk.summary.pastDueProjects > 0 ? `- ${risk.summary.pastDueProjects} project melewati deadline` : '',
      risk.summary.overdueTasks > 0 ? `- ${risk.summary.overdueTasks} task overdue` : '',
      risk.summary.staleTasks > 0 ? `- ${risk.summary.staleTasks} task stale (tidak bergerak >3 hari)` : '',
    ]
      .filter(Boolean)
      .join('\n') || '- Tidak ada risiko kritis'

  return `Kamu adalah manajer proyek senior yang berpengalaman dan cerdas. Tugasmu membuat laporan harian untuk tim.

Tanggal: ${tanggal}

═══ DATA PROJECT AKTIF (${activeProjects.length} project) ═══
${projectLines || '- Tidak ada project aktif dengan data lengkap'}

═══ DATA TIM (${load.rows.length} anggota aktif) ═══
${userLines || '- Tidak ada data tim'}

═══ KPI HARI INI ═══
- Total task: ${overview.tasks.total}
- Task overdue: ${overview.tasks.overdueOpen}
- Selesai 7 hari terakhir: ${overview.tasks.closed7d}
- Velocity minggu ini: ${overview.velocity.closed7d} task/minggu
- Task stale: ${overview.tasks.staleInProgress}

═══ SINYAL RISIKO (${risk.severity.toUpperCase()}) ═══
${riskLines}
${snapshotContext}
═══ INSTRUKSI LAPORAN ═══
${(customInstruction ?? DEFAULT_REPORT_INSTRUCTION).replace('{TANGGAL}', tanggal)}

Tulis laporan sekarang:`
}
