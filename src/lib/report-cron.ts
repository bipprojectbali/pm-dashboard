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

// Status guard hari ini.
export async function getCronGuardStatus(): Promise<{ active: boolean; date: string | null; today: string }> {
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)
  const today = todayKey(now)
  const stored = await getSetting('report.cronLastSentDate')
  return { active: stored === today, date: stored || null, today }
}

// Reset guard — cron bisa kirim lagi hari ini.
export async function resetCronGuard(): Promise<void> {
  await setSetting('report.cronLastSentDate', '')
}

// Aktifkan guard — cron tidak akan kirim lagi hari ini.
export async function activateCronGuard(): Promise<void> {
  const tz = await getReportTimezone()
  const now = getZonedParts(tz)
  await setSetting('report.cronLastSentDate', todayKey(now))
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
  if (!result.ok && result.skippedReason !== 'already_today' && result.skippedReason !== 'in_flight') {
    appLog('warn', `Daily report cron scheduled failed: ${result.message}`)
  }
}
