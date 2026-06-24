import { getSetting, setSetting } from './app-settings'
import { appLog } from './applog'
import { callClaudeAPI } from './daily-report.claude-client'
import { buildReportPrompt, DEFAULT_REPORT_INSTRUCTION } from './daily-report.prompt'
import { sendToTelegram } from './daily-report.telegram-client'
import { captureSnapshot } from './daily-snapshot'
import { recordSendHistory, type SendTrigger } from './report-history'

export { DEFAULT_REPORT_INSTRUCTION }

// In-memory lock: hanya satu pengiriman boleh berjalan di proses ini pada satu
// waktu. Mencegah race antara cron + tombol manual + double-click.
let sendInFlight: Promise<{ ok: boolean; message: string }> | null = null

export function isSendInFlight(): boolean {
  return sendInFlight !== null
}

export async function getLastSentAt(): Promise<string | null> {
  return getSetting('report.lastSentAt')
}

export async function buildPromptOnly(): Promise<string> {
  return buildReportPrompt()
}

export async function generateReportPreview(): Promise<string> {
  const [apiKey, model, baseUrl, timeoutRaw] = await Promise.all([
    getSetting('ai.anthropicApiKey'),
    getSetting('ai.model'),
    getSetting('ai.baseUrl'),
    getSetting('ai.timeoutSeconds'),
  ])
  if (!apiKey) throw new Error('Anthropic API key belum dikonfigurasi')
  const prompt = await buildReportPrompt()
  const timeoutMs = (Number(timeoutRaw) || 120) * 1000
  return callClaudeAPI(apiKey, model ?? 'claude-opus-4-7', prompt, baseUrl ?? undefined, timeoutMs)
}

export async function sendCustomReport(text: string): Promise<{ ok: boolean; message: string }> {
  if (sendInFlight) return { ok: false, message: 'Pengiriman lain sedang berlangsung, coba lagi sebentar.' }
  sendInFlight = (async () => {
    const [botToken, chatId, tgTimeoutRaw] = await Promise.all([
      getSetting('telegram.botToken'),
      getSetting('telegram.chatId'),
      getSetting('telegram.timeoutSeconds'),
    ])
    if (!botToken) return { ok: false, message: 'Telegram bot token belum dikonfigurasi' }
    if (!chatId) return { ok: false, message: 'Telegram chat ID belum dikonfigurasi' }
    const tgTimeoutMs = (Number(tgTimeoutRaw) || 30) * 1000
    const prevLastSent = await getSetting('report.lastSentAt')
    await setSetting('report.lastSentAt', new Date().toISOString())
    try {
      await sendToTelegram(botToken, chatId, text, tgTimeoutMs)
      appLog('info', 'Custom report: sent successfully')
      await recordSendHistory({
        sentAt: new Date().toISOString(),
        ok: true,
        message: 'Laporan berhasil dikirim ke Telegram',
        trigger: 'custom',
        markdown: text,
      })
      return { ok: true, message: 'Laporan berhasil dikirim ke Telegram' }
    } catch (e) {
      if (prevLastSent) await setSetting('report.lastSentAt', prevLastSent)
      const msg = e instanceof Error ? e.message : String(e)
      appLog('error', `Custom report failed: ${msg}`)
      await recordSendHistory({ sentAt: new Date().toISOString(), ok: false, message: msg, trigger: 'custom' })
      return { ok: false, message: msg }
    }
  })()
  try {
    return await sendInFlight
  } finally {
    sendInFlight = null
  }
}

export async function generateAndSendDailyReport(
  opts: { trigger?: SendTrigger } = {},
): Promise<{ ok: boolean; message: string }> {
  if (sendInFlight) return { ok: false, message: 'Pengiriman lain sedang berlangsung, coba lagi sebentar.' }
  const trigger: SendTrigger = opts.trigger ?? 'manual'
  sendInFlight = (async () => {
    const [apiKey, model, baseUrl, botToken, chatId, timeoutRaw, tgTimeoutRaw] = await Promise.all([
      getSetting('ai.anthropicApiKey'),
      getSetting('ai.model'),
      getSetting('ai.baseUrl'),
      getSetting('telegram.botToken'),
      getSetting('telegram.chatId'),
      getSetting('ai.timeoutSeconds'),
      getSetting('telegram.timeoutSeconds'),
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
      const timeoutMs = (Number(timeoutRaw) || 120) * 1000
      const tgTimeoutMs = (Number(tgTimeoutRaw) || 30) * 1000
      const report = await callClaudeAPI(apiKey, model ?? 'claude-opus-4-7', prompt, baseUrl ?? undefined, timeoutMs)
      await sendToTelegram(botToken, chatId, report, tgTimeoutMs)
      await setSetting('report.lastSentAt', new Date().toISOString())
      appLog('info', 'Daily report: sent successfully')
      await recordSendHistory({
        sentAt: new Date().toISOString(),
        ok: true,
        message: 'Laporan berhasil dikirim ke Telegram',
        trigger,
        markdown: report,
      })
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
  try {
    return await sendInFlight
  } finally {
    sendInFlight = null
  }
}
