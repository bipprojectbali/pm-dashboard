import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { appLog } from './applog'
import { getSetting, setSetting } from './app-settings'
import { buildSnapshotContext, captureSnapshot } from './daily-snapshot'
import { recordSendHistory, type SendTrigger } from './report-history'
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

_pm-dashboard AI report_`

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
${snapshotContext}
═══ INSTRUKSI LAPORAN ═══
${(customInstruction ?? DEFAULT_REPORT_INSTRUCTION).replace('{TANGGAL}', tanggal)}

Tulis laporan sekarang:`
}

// ─── Concurrency guard ────────────────────────────────────────────────────────
// In-memory lock: hanya satu pengiriman boleh berjalan di proses ini pada satu
// waktu. Mencegah race antara cron + tombol manual + double-click.
let sendInFlight: Promise<{ ok: boolean; message: string }> | null = null

// Minimum jeda antar pengiriman (manual atau cron). Bisa di-override via setting
// `report.cooldownMinutes` (default 30 menit). Test endpoint tidak terpengaruh.
const DEFAULT_COOLDOWN_MIN = 30

async function getCooldownMs(): Promise<number> {
  const raw = await getSetting('report.cooldownMinutes')
  const min = raw ? parseInt(raw, 10) : DEFAULT_COOLDOWN_MIN
  return (Number.isFinite(min) && min > 0 ? min : DEFAULT_COOLDOWN_MIN) * 60 * 1000
}

async function checkCooldown(force: boolean): Promise<{ blocked: boolean; remainingMs: number }> {
  if (force) return { blocked: false, remainingMs: 0 }
  const last = await getSetting('report.lastSentAt')
  if (!last) return { blocked: false, remainingMs: 0 }
  const cooldown = await getCooldownMs()
  const elapsed = Date.now() - new Date(last).getTime()
  if (elapsed < cooldown) return { blocked: true, remainingMs: cooldown - elapsed }
  return { blocked: false, remainingMs: 0 }
}

function fmtMinutes(ms: number): string {
  const min = Math.ceil(ms / 60_000)
  return min >= 60 ? `${Math.ceil(min / 60)} jam` : `${min} menit`
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isSendInFlight(): boolean {
  return sendInFlight !== null
}

export async function getCooldownStatus(): Promise<{ active: boolean; remainingMs: number; lastSentAt: string | null; cooldownMinutes: number }> {
  const last = await getSetting('report.lastSentAt')
  const cooldownMs = await getCooldownMs()
  const cooldownMinutes = Math.round(cooldownMs / 60_000)
  if (!last) return { active: false, remainingMs: 0, lastSentAt: null, cooldownMinutes }
  const elapsed = Date.now() - new Date(last).getTime()
  if (elapsed < cooldownMs) return { active: true, remainingMs: cooldownMs - elapsed, lastSentAt: last, cooldownMinutes }
  return { active: false, remainingMs: 0, lastSentAt: last, cooldownMinutes }
}

export async function buildPromptOnly(): Promise<string> {
  return buildReportPrompt()
}

export async function sendCustomReport(text: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  if (sendInFlight) return { ok: false, message: 'Pengiriman lain sedang berlangsung, coba lagi sebentar.' }
  const cd = await checkCooldown(opts.force ?? false)
  if (cd.blocked) {
    return { ok: false, message: `Cooldown aktif — laporan terakhir dikirim baru-baru ini. Tunggu ${fmtMinutes(cd.remainingMs)} atau pakai opsi force.` }
  }
  sendInFlight = (async () => {
    const [botToken, chatId] = await Promise.all([
      getSetting('telegram.botToken'),
      getSetting('telegram.chatId'),
    ])
    if (!botToken) return { ok: false, message: 'Telegram bot token belum dikonfigurasi' }
    if (!chatId) return { ok: false, message: 'Telegram chat ID belum dikonfigurasi' }
    const prevLastSent = await getSetting('report.lastSentAt')
    await setSetting('report.lastSentAt', new Date().toISOString())
    try {
      await sendToTelegram(botToken, chatId, text)
      appLog('info', 'Custom report: sent successfully')
      await recordSendHistory({ sentAt: new Date().toISOString(), ok: true, message: 'Laporan berhasil dikirim ke Telegram', trigger: 'custom' })
      return { ok: true, message: 'Laporan berhasil dikirim ke Telegram' }
    } catch (e) {
      if (prevLastSent) await setSetting('report.lastSentAt', prevLastSent)
      const msg = e instanceof Error ? e.message : String(e)
      appLog('error', `Custom report failed: ${msg}`)
      await recordSendHistory({ sentAt: new Date().toISOString(), ok: false, message: msg, trigger: 'custom' })
      return { ok: false, message: msg }
    }
  })()
  try { return await sendInFlight } finally { sendInFlight = null }
}

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

export async function generateAndSendDailyReport(opts: { force?: boolean; trigger?: SendTrigger } = {}): Promise<{ ok: boolean; message: string }> {
  if (sendInFlight) return { ok: false, message: 'Pengiriman lain sedang berlangsung, coba lagi sebentar.' }
  const cd = await checkCooldown(opts.force ?? false)
  if (cd.blocked) {
    return { ok: false, message: `Cooldown aktif — laporan terakhir dikirim baru-baru ini. Tunggu ${fmtMinutes(cd.remainingMs)} atau pakai opsi force.` }
  }
  const trigger: SendTrigger = opts.trigger ?? 'manual'
  sendInFlight = (async () => {
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
    const prevLastSent = await getSetting('report.lastSentAt')
    await setSetting('report.lastSentAt', new Date().toISOString())
    try {
      appLog('info', `Daily report: generating... (trigger=${trigger})`)
      await captureSnapshot()
      const prompt = await buildReportPrompt()
      const report = await callClaudeAPI(apiKey, model ?? 'claude-opus-4-7', prompt, baseUrl ?? undefined)
      await sendToTelegram(botToken, chatId, report)
      await setSetting('report.lastSentAt', new Date().toISOString())
      appLog('info', 'Daily report: sent successfully')
      await recordSendHistory({ sentAt: new Date().toISOString(), ok: true, message: 'Laporan berhasil dikirim ke Telegram', trigger })
      return { ok: true, message: 'Laporan berhasil dikirim ke Telegram' }
    } catch (e) {
      if (prevLastSent) await setSetting('report.lastSentAt', prevLastSent)
      else await setSetting('report.lastSentAt', '')
      const msg = e instanceof Error ? e.message : String(e)
      appLog('error', `Daily report failed: ${msg}`)
      await recordSendHistory({ sentAt: new Date().toISOString(), ok: false, message: msg, trigger })
      return { ok: false, message: msg }
    }
  })()
  try { return await sendInFlight } finally { sendInFlight = null }
}
