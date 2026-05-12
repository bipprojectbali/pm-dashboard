import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { appLog } from './applog'
import { getSetting, setSetting } from './app-settings'

// ─── Claude API ──────────────────────────────────────────────────────────────

async function callClaudeAPI(apiKey: string, model: string, prompt: string, baseUrl?: string): Promise<string> {
  const endpoint = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/v1/messages`
    : 'https://api.anthropic.com/v1/messages'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}`)
  }
  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Claude API returned no text content')
  return text
}

// ─── Telegram ────────────────────────────────────────────────────────────────

async function sendToTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  // Telegram Markdown mode: split if >4096 chars
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000))

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { description?: string }
      throw new Error(`Telegram error ${res.status}: ${err.description ?? 'unknown'}`)
    }
  }
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

async function buildReportPrompt(): Promise<string> {
  const [overview, health, load, risk] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 50 }),
    computeTeamLoad({ includeUnassigned: false, limit: 30 }),
    computeRiskReport(),
  ])

  const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const tanggal = nowWIB.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const activeProjects = health.projects.filter((p) => p.status === 'ACTIVE')
  const projectLines = activeProjects.map((p) =>
    `- *${p.name}* (${p.grade}, skor ${p.score}/100): ${p.openTasks} task open, ${p.overdueTasks} overdue` +
    (p.daysUntilDue != null ? `, ${p.daysUntilDue} hari tersisa` : ', tanpa deadline') +
    (p.pastDue ? ' ⚠️ LEWAT DEADLINE' : '') +
    (p.blockedTasks > 0 ? `, ${p.blockedTasks} diblokir` : '')
  ).join('\n')

  const userLines = load.rows.map((u) =>
    `- *${u.name}*: ${u.open} open, ${u.overdue} overdue, ${u.closed7d} selesai 7h` +
    (u.overloaded ? ' 🔴 OVERLOADED' : '')
  ).join('\n')

  const riskLines = [
    risk.summary.pastDueProjects > 0 ? `- ${risk.summary.pastDueProjects} project melewati deadline` : '',
    risk.summary.overdueTasks > 0 ? `- ${risk.summary.overdueTasks} task overdue` : '',
    risk.summary.staleTasks > 0 ? `- ${risk.summary.staleTasks} task stale (tidak bergerak >3 hari)` : '',
  ].filter(Boolean).join('\n') || '- Tidak ada risiko kritis'

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

═══ INSTRUKSI LAPORAN ═══
Buat laporan harian manajerial dalam *bahasa Indonesia* yang:
1. Cerdas dan manusiawi — bukan sekadar daftar angka
2. Berikan pendapat nyata dan analisis tren kondisi tim & project
3. Highlight risiko yang perlu perhatian segera dan alasannya
4. Bandingkan kinerja antar anggota tim secara fair — siapa produktif, siapa perlu dukungan
5. Identifikasi project yang paling kritis dan mengapa
6. Berikan 2-3 rekomendasi konkret yang bisa dilakukan besok
7. Panjang 400-600 kata, pakai format Telegram Markdown (*bold*, _italic_)
8. Mulai dengan: "📊 *Laporan Harian — ${tanggal}*" lalu ringkasan 1 kalimat kondisi keseluruhan
9. Akhiri dengan footer: "_Laporan dibuat otomatis oleh AI pm-dashboard_"

Tulis laporan sekarang:`
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateReportPreview(): Promise<string> {
  const [apiKey, model, baseUrl] = await Promise.all([
    getSetting('ai.anthropicApiKey'),
    getSetting('ai.model'),
    getSetting('ai.baseUrl'),
  ])
  if (!apiKey) throw new Error('Anthropic API key belum dikonfigurasi')
  const prompt = await buildReportPrompt()
  return callClaudeAPI(apiKey, model ?? 'claude-opus-4-7', prompt, baseUrl ?? undefined)
}

export async function generateAndSendDailyReport(): Promise<{ ok: boolean; message: string }> {
  const [apiKey, model, baseUrl, botToken, chatId] = await Promise.all([
    getSetting('ai.anthropicApiKey'),
    getSetting('ai.model'),
    getSetting('ai.baseUrl'),
    getSetting('telegram.botToken'),
    getSetting('telegram.chatId'),
  ])

  if (!apiKey) return { ok: false, message: 'Anthropic API key belum dikonfigurasi' }
  if (!botToken) return { ok: false, message: 'Telegram bot token belum dikonfigurasi' }
  if (!chatId) return { ok: false, message: 'Telegram chat ID belum dikonfigurasi' }

  try {
    appLog('info', 'Daily report: generating...')
    const prompt = await buildReportPrompt()
    const report = await callClaudeAPI(apiKey, model ?? 'claude-opus-4-7', prompt, baseUrl ?? undefined)
    await sendToTelegram(botToken, chatId, report)
    await setSetting('report.lastSentAt', new Date().toISOString())
    appLog('info', 'Daily report: sent successfully')
    return { ok: true, message: 'Laporan berhasil dikirim ke Telegram' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    appLog('error', `Daily report failed: ${msg}`)
    return { ok: false, message: msg }
  }
}
