import { generateAndSendDailyReport } from './daily-report'
import { getSetting } from './app-settings'
import { getReportTimezone, getZonedParts } from './timezone'
import { appLog } from './applog'

export interface CronRunResult {
  ok: boolean
  message: string
  skippedReason?: 'not_enabled' | 'in_flight'
}

// Jalankan cron sekarang tanpa cek waktu jadwal — untuk tombol "Simulasi Cron".
export async function runCronNow(): Promise<CronRunResult> {
  const enabled = await getSetting('telegram.enabled')
  if (enabled !== 'true') {
    return { ok: false, message: 'Telegram tidak aktif — aktifkan di Channel Settings.', skippedReason: 'not_enabled' }
  }

  const tz = await getReportTimezone()
  const now = getZonedParts(tz)
  const key = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`

  appLog('info', `Daily report cron: mengirim laporan ${key}...`)
  const result = await generateAndSendDailyReport({ trigger: 'cron' })

  if (!result.ok) {
    const reason = result.message.includes('berlangsung') ? 'in_flight' as const : undefined
    appLog('warn', `Daily report cron gagal: ${result.message}`)
    return { ok: false, message: result.message, skippedReason: reason }
  }

  return { ok: true, message: result.message }
}

// Dipanggil oleh Bun.cron('* * * * *'): exact minute check.
// Bun.cron memiliki no-overlap guarantee — handler tidak akan fire lagi
// selama Promise sebelumnya belum settle. Ini mencegah double-send
// tanpa perlu guard atau cooldown apapun.
export async function runCronIfScheduled(): Promise<void> {
  const schedHour = parseInt((await getSetting('report.scheduleHour')) ?? '18', 10)
  const schedMinute = parseInt((await getSetting('report.scheduleMinute')) ?? '0', 10)
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)

  if (now.hour !== schedHour || now.minute !== schedMinute) return

  const result = await runCronNow()
  if (!result.ok && result.skippedReason !== 'in_flight') {
    appLog('warn', `Daily report cron scheduled failed: ${result.message}`)
  }
}

// Dipanggil sekali saat startup: tangani kasus server restart dalam
// 5 menit setelah jadwal (window kecil, one-shot, tidak ada loop).
export async function runCronAtStartup(): Promise<void> {
  const enabled = await getSetting('telegram.enabled')
  if (enabled !== 'true') return

  const schedHour = parseInt((await getSetting('report.scheduleHour')) ?? '18', 10)
  const schedMinute = parseInt((await getSetting('report.scheduleMinute')) ?? '0', 10)
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)
  const delta = (now.hour * 60 + now.minute) - (schedHour * 60 + schedMinute)

  if (delta < 0 || delta >= 5) return

  appLog('info', `Cron startup: dalam window jadwal (delta=${delta}m), mengirim...`)
  const result = await runCronNow()
  if (!result.ok && result.skippedReason !== 'in_flight') {
    appLog('warn', `Cron startup gagal: ${result.message}`)
  }
}
