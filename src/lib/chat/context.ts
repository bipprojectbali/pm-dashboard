import { fetchContextData } from './context.queries'

export async function buildChatContext(): Promise<string> {
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const {
    overview, health, load, risk, events,
    statusChanges, comments, topOverdue,
    allUsers, activeProjects, membersByProject,
    githubCommits7d, githubByProject, topContributors7d, openPrCount, ghNameMap,
  } = await fetchContextData(now, since7d, since30d)

  const userLines = allUsers.map((u) => {
    const loadRow = load.rows.find((r) => r.userId === u.id)
    const openTasks = u.assignedTasks
    const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now)
    const estimateTotal = openTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    const closed30d = u._count.assignedTasks
    const overloaded = loadRow?.overloaded ? ' 🔴 OVERLOADED' : ''
    return `- ${u.name} (${u.role}, ${u.email}): ${openTasks.length} open, ${overdueTasks.length} overdue, ${closed30d} selesai 30h, ${estimateTotal.toFixed(0)}h estimasi, ${u.projectMemberships.length} proyek${overloaded}`
  }).join('\n')

  const projectLines = activeProjects.map((p) => {
    const memList = membersByProject.get(p.id) ?? []
    const memberNames = memList.slice(0, 5).map((m) => `${m.name}(${m.role})`).join(', ')
    return `- ${p.name} (Grade ${p.grade}, ${p.score}/100): ${p.openTasks} open, ${p.overdueTasks} overdue${p.pastDue ? ' ⚠️ LEWAT' : ''}${memberNames ? ` | Tim: ${memberNames}` : ''}`
  }).join('\n')

  const overdueLines = topOverdue.map((t) => {
    const days = Math.floor((now.getTime() - new Date(t.dueAt!).getTime()) / 86_400_000)
    return `- [${t.priority}] ${t.title} — ${t.assignee?.name ?? 'Unassigned'}, ${t.project?.name ?? '?'}, ${days} hari overdue`
  }).join('\n')

  const activityLines = [
    ...statusChanges.map((s) => `- ${s.author?.name ?? '?'}: "${s.task?.title}" ${s.fromStatus}→${s.toStatus} | ${s.task?.project?.name ?? '?'}`),
    ...comments.map((c) => `- ${c.author?.name ?? '?'} komentar di "${c.task?.title}": ${c.body.slice(0, 100)}`),
  ].slice(0, 25).join('\n')

  const riskLines = [
    risk.summary.pastDueProjects > 0 ? `- ${risk.summary.pastDueProjects} proyek melewati deadline` : '',
    risk.summary.overdueTasks > 0 ? `- ${risk.summary.overdueTasks} task overdue` : '',
    risk.summary.staleTasks > 0 ? `- ${risk.summary.staleTasks} task stale >3 hari` : '',
  ].filter(Boolean).join('\n') || '- Tidak ada risiko kritis'

  const eventLines = events.length
    ? events.map((e) => `- ${new Date(e.startsAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: ${e.title}`).join('\n')
    : '- Tidak ada event mendatang'

  const githubProjectLines = githubByProject.length
    ? githubByProject.map((g) => `- ${ghNameMap.get(g.projectId) ?? '?'}: ${g._count._all} commit`).join('\n')
    : '- Tidak ada commit'
  const githubContribLines = topContributors7d.length
    ? topContributors7d.map((c) => `${c.actorLogin}(${c._count._all})`).join(', ')
    : 'tidak ada'

  return `Kamu adalah asisten AI untuk project management dashboard. Kamu memiliki pengetahuan lengkap tentang tim dan proyek. Jawab dengan ringkas, akurat, dan helpful. Data di bawah adalah kondisi real-time.

ATURAN JAWABAN:
- Jangan halusinasi entitas (user/task/project) yang tidak ada di "ROSTER TIM", "PROYEK AKTIF", "DOKUMEN RELEVAN", atau hasil tool calls.
- Bila merujuk fakta dari "DOKUMEN RELEVAN", sertakan tag sumber dalam format [#1], [#2], dst persis seperti label di dokumen tersebut.
- Bila pertanyaan menyangkut data yang tidak tersedia di konteks dan tidak ada di dokumen, jawab terus terang "data ini belum tercatat" alih-alih menebak.

FORMAT MARKDOWN (PENTING — UI render via react-markdown + remark-gfm):
- Untuk tabel: gunakan GFM table dengan SETIAP BARIS DI BARIS BARU. Header dan separator wajib dipisah newline, contoh:
  | No | Nama | Role |
  | --- | --- | --- |
  | 1 | Amalia | USER |
  | 2 | Bagas | ADMIN |
  Jangan tulis seluruh tabel dalam satu paragraf (mis. "| 1 | A | USER | | 2 | B | ADMIN |") — UI tidak bisa render.
- Sebelum tabel: sisakan satu baris kosong dari paragraf di atasnya.
- List pakai tanda minus + spasi sebagai bullet, dengan newline per item. Hindari emoji sebagai bullet.

PEMAKAIAN TOOLS (WAJIB):
- Tersedia 4 tool query read-only: query_users, query_tasks, query_project_detail, query_github_activity. Hasilnya = data DB akurat real-time.
- WAJIB pakai tool untuk pertanyaan numerik/agregat (berapa, total, jumlah, top, rata-rata). Jangan tebak dari snapshot di atas — snapshot bisa tertinggal beberapa menit.
- WAJIB pakai tool kalau pertanyaan menyebut entitas spesifik yang belum kelihatan di konteks (mis. "task X", "proyek Y", "siapa Z").
- Boleh chain beberapa tool dalam satu jawaban (mis. resolve user lewat query_users dulu, lalu query_tasks pakai assigneeEmail).
- Tool error / hasil kosong → jawab "data tidak ditemukan", jangan halusinasi.

WAKTU SEKARANG: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB

═══ KPI SISTEM ═══
- Total task: ${overview.tasks.total} | Overdue: ${overview.tasks.overdueOpen} | Selesai 7h: ${overview.tasks.closed7d}
- Velocity: ${overview.velocity.closed7d} task/minggu | Stale: ${overview.tasks.staleInProgress}
- Risiko keseluruhan: ${risk.severity.toUpperCase()}

═══ ROSTER TIM (${allUsers.length} anggota) ═══
${userLines || '- Belum ada user'}

═══ PROYEK AKTIF (${activeProjects.length}) ═══
${projectLines || '- Belum ada proyek aktif'}

═══ TASK OVERDUE KRITIS (TOP ${topOverdue.length}) ═══
${overdueLines || '- Tidak ada task overdue kritis'}

═══ AKTIVITAS 7 HARI TERAKHIR ═══
${activityLines || '- Tidak ada aktivitas terbaru'}

═══ AKTIVITAS GITHUB 7H ═══
- Total commit 7h: ${githubCommits7d} | Open PR sistem: ${openPrCount}
- Top proyek:
${githubProjectLines}
- Top kontributor: ${githubContribLines}

═══ RISIKO ═══
${riskLines}

═══ EVENTS MENDATANG ═══
${eventLines}`
}
