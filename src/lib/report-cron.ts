import { generateAndSendDailyReport } from './daily-report'
import { getSetting, setSetting } from './app-settings'
import { getReportTimezone, getZonedParts } from './timezone'
import { appLog } from './applog'

export type CronSkipReason = 'not_enabled' | 'already_today' | 'in_flight'

export interface CronRunResult {
  ok: boolean
  message: string
  skippedReason?: CronSkipReason
}

function todayKey(now: ReturnType<typeof getZonedParts>): string {
  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`
}

// Jalankan cron sekarang tanpa cek waktu jadwal — untuk tombol "Simulasi Cron".
// Guard cronLastSentDate tetap aktif agar perilaku identik dengan cron sungguhan.
export async function runCronNow(): Promise<CronRunResult> {
  const enabled = await getSetting('telegram.enabled')
  if (enabled !== 'true') {
    return { ok: false, message: 'Telegram tidak aktif — aktifkan di Channel Settings.', skippedReason: 'not_enabled' }
  }

  const tz = await getReportTimezone()
  const now = getZonedParts(tz)
  const key = todayKey(now)

  const cronLastDate = await getSetting('report.cronLastSentDate')
  if (cronLastDate === key) {
    return {
      ok: false,
      message: `Laporan cron sudah terkirim hari ini (${key}). Gunakan "Reset Guard" untuk kirim ulang.`,
      skippedReason: 'already_today',
    }
  }

  appLog('info', `Daily report cron: mengirim laporan ${key}...`)
  const result = await generateAndSendDailyReport({ trigger: 'cron', force: true })

  if (result.ok) {
    await setSetting('report.cronLastSentDate', key)
  } else {
    const reason: CronSkipReason = result.message.includes('berlangsung') ? 'in_flight' : undefined as any
    appLog('warn', `Daily report cron gagal: ${result.message}`)
    return { ok: false, message: result.message, skippedReason: reason }
  }

  return { ok: true, message: result.message }
}

// Reset guard harian sehingga cron bisa kirim lagi hari ini.
export async function resetCronGuard(): Promise<void> {
  await setSetting('report.cronLastSentDate', '')
}

// Dipanggil oleh setInterval: cek waktu dulu baru jalankan cron.
export async function runCronIfScheduled(): Promise<void> {
  const schedHour = parseInt((await getSetting('report.scheduleHour')) ?? '18', 10)
  const schedMinute = parseInt((await getSetting('report.scheduleMinute')) ?? '0', 10)
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)

  if (now.hour !== schedHour || now.minute !== schedMinute) return

  const result = await runCronNow()
  if (!result.ok && result.skippedReason !== 'already_today' && result.skippedReason !== 'in_flight') {
    appLog('warn', `Daily report cron scheduled failed: ${result.message}`)
  }
}
