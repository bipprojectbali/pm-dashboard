import { getAllSettings } from './app-settings'
import { getLastSentAt, isSendInFlight } from './daily-report'
import { getReportTimezone, getZonedParts } from './timezone'

export interface ReportDiagnostic {
  version: { version: string | null; commit: string | null; env: string | null }
  now: { serverUtc: string; configuredTz: string; zonedHour: number; zonedMinute: number }
  schedule: {
    hourRaw: string | null
    minuteRaw: string | null
    parsedHour: number | null
    parsedMinute: number | null
    valid: boolean
    wouldFireNow: boolean
    minutesUntilNextFire: number | null
  }
  telegram: { enabled: boolean; botTokenSet: boolean; chatIdSet: boolean }
  ai: { apiKeySet: boolean; model: string | null; baseUrlSet: boolean }
  lastSentAt: string | null
  sendInFlight: boolean
  blockers: string[]
  healthy: boolean
}

export async function getReportDiagnostic(): Promise<ReportDiagnostic> {
  const settings = await getAllSettings()
  const tz = await getReportTimezone()
  const zoned = getZonedParts(tz)
  const schedHourRaw = settings['report.scheduleHour']
  const schedMinuteRaw = settings['report.scheduleMinute']
  const schedHour = parseInt(schedHourRaw ?? '18', 10)
  const schedMinute = parseInt(schedMinuteRaw ?? '0', 10)
  const schedValid =
    Number.isFinite(schedHour) && Number.isFinite(schedMinute) &&
    schedHour >= 0 && schedHour < 24 && schedMinute >= 0 && schedMinute < 60
  const wouldFireNow = schedValid && zoned.hour === schedHour && zoned.minute === schedMinute
  const enabled = settings['telegram.enabled'] === 'true'
  const inFlight = isSendInFlight()
  const lastSentAt = await getLastSentAt()

  const minutesUntilNextFire = (() => {
    if (!schedValid) return null
    const nowMin = zoned.hour * 60 + zoned.minute
    const schedMin = schedHour * 60 + schedMinute
    let delta = schedMin - nowMin
    if (delta <= 0) delta += 24 * 60
    return delta
  })()

  const blockers: string[] = []
  if (!enabled) blockers.push('telegram.enabled !== "true"')
  if (!schedValid) blockers.push(`schedule invalid (hour="${schedHourRaw}", minute="${schedMinuteRaw}")`)
  if (!settings['telegram.botToken']) blockers.push('telegram.botToken kosong')
  if (!settings['telegram.chatId']) blockers.push('telegram.chatId kosong')
  if (!settings['ai.anthropicApiKey']) blockers.push('ai.anthropicApiKey kosong')
  if (inFlight) blockers.push('pengiriman sedang berlangsung (sendInFlight)')

  return {
    version: {
      version: process.env.npm_package_version ?? null,
      commit: process.env.GIT_COMMIT ?? null,
      env: process.env.NODE_ENV ?? null,
    },
    now: { serverUtc: new Date().toISOString(), configuredTz: tz, zonedHour: zoned.hour, zonedMinute: zoned.minute },
    schedule: {
      hourRaw: schedHourRaw ?? null,
      minuteRaw: schedMinuteRaw ?? null,
      parsedHour: schedValid ? schedHour : null,
      parsedMinute: schedValid ? schedMinute : null,
      valid: schedValid,
      wouldFireNow,
      minutesUntilNextFire,
    },
    telegram: {
      enabled,
      botTokenSet: !!settings['telegram.botToken'],
      chatIdSet: !!settings['telegram.chatId'],
    },
    ai: {
      apiKeySet: !!settings['ai.anthropicApiKey'],
      model: settings['ai.model'] ?? null,
      baseUrlSet: !!settings['ai.baseUrl'],
    },
    lastSentAt,
    sendInFlight: inFlight,
    blockers,
    healthy: blockers.length === 0,
  }
}
