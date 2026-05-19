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

// Dipanggil oleh setInterval: cek waktu dulu baru jalankan cron.
// Menggunakan window 30 menit SETELAH jadwal (bukan exact minute) agar
// tahan terhadap server restart yang terlambat hingga 29 menit.
// Double-fire dicegah oleh cronLastSentDate di runCronNow().
export async function runCronIfScheduled(): Promise<void> {
  const schedHour = parseInt((await getSetting('report.scheduleHour')) ?? '18', 10)
  const schedMinute = parseInt((await getSetting('report.scheduleMinute')) ?? '0', 10)
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)

  const nowMin = now.hour * 60 + now.minute
  const schedMin = schedHour * 60 + schedMinute
  const delta = nowMin - schedMin

  // Fire jika kita berada 0–29 menit SETELAH jadwal
  if (delta < 0 || delta >= 30) return

  const result = await runCronNow()
  if (!result.ok && result.skippedReason !== 'in_flight') {
    appLog('warn', `Daily report cron scheduled failed: ${result.message}`)
  }
}
