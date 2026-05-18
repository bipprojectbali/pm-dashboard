import { getSetting } from './app-settings'

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

export const COMMON_TIMEZONES: Array<{ value: string; label: string; short: string }> = [
  { value: 'Asia/Jakarta', label: 'WIB — Jakarta (UTC+7)', short: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA — Makassar (UTC+8)', short: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT — Jayapura (UTC+9)', short: 'WIT' },
  { value: 'UTC', label: 'UTC (UTC+0)', short: 'UTC' },
]

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function getReportTimezone(): Promise<string> {
  const raw = await getSetting('report.timezone')
  if (raw && isValidTimezone(raw)) return raw
  return DEFAULT_TIMEZONE
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function getZonedParts(tz: string, date: Date = new Date()): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const m: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value
  return {
    year: parseInt(m.year, 10),
    month: parseInt(m.month, 10),
    day: parseInt(m.day, 10),
    hour: parseInt(m.hour, 10) % 24,
    minute: parseInt(m.minute, 10),
  }
}

export function getZonedDateKey(tz: string, date: Date = new Date()): Date {
  const { year, month, day } = getZonedParts(tz, date)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatZonedDateLong(tz: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
}

export function formatDateKeyShort(dateKey: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(dateKey)
}

export function timezoneShortLabel(tz: string): string {
  return COMMON_TIMEZONES.find((t) => t.value === tz)?.short ?? tz
}
