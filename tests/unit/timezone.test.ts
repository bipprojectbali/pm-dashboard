import { test, expect, describe, afterAll } from 'bun:test'
import {
  DEFAULT_TIMEZONE,
  COMMON_TIMEZONES,
  formatDateKeyShort,
  formatZonedDateLong,
  getReportTimezone,
  getZonedDateKey,
  getZonedParts,
  timezoneShortLabel,
} from '../../src/lib/timezone'
import { prisma } from '../../src/lib/db'

const REF_UTC = new Date('2026-05-17T16:30:00.000Z') // 23:30 WIB, 00:30 (+1d) WITA, 01:30 (+1d) WIT

describe('getZonedParts', () => {
  test('Asia/Jakarta (UTC+7)', () => {
    const p = getZonedParts('Asia/Jakarta', REF_UTC)
    expect(p).toEqual({ year: 2026, month: 5, day: 17, hour: 23, minute: 30 })
  })

  test('Asia/Makassar (UTC+8) — crosses midnight', () => {
    const p = getZonedParts('Asia/Makassar', REF_UTC)
    expect(p).toEqual({ year: 2026, month: 5, day: 18, hour: 0, minute: 30 })
  })

  test('Asia/Jayapura (UTC+9)', () => {
    const p = getZonedParts('Asia/Jayapura', REF_UTC)
    expect(p).toEqual({ year: 2026, month: 5, day: 18, hour: 1, minute: 30 })
  })

  test('UTC', () => {
    const p = getZonedParts('UTC', REF_UTC)
    expect(p).toEqual({ year: 2026, month: 5, day: 17, hour: 16, minute: 30 })
  })

  test('hour wraps 24→0', () => {
    const witaMidnight = new Date('2026-05-17T16:00:00.000Z') // 00:00 WITA next day
    const p = getZonedParts('Asia/Makassar', witaMidnight)
    expect(p.hour).toBe(0)
    expect(p.day).toBe(18)
  })
})

describe('getZonedDateKey', () => {
  test('returns UTC midnight matching local date in TZ', () => {
    const wita = getZonedDateKey('Asia/Makassar', REF_UTC)
    expect(wita.toISOString()).toBe('2026-05-18T00:00:00.000Z')

    const wib = getZonedDateKey('Asia/Jakarta', REF_UTC)
    expect(wib.toISOString()).toBe('2026-05-17T00:00:00.000Z')
  })

  test('idempotent across same TZ-day', () => {
    const morning = getZonedDateKey('Asia/Makassar', new Date('2026-05-18T01:00:00.000Z'))
    const evening = getZonedDateKey('Asia/Makassar', new Date('2026-05-18T15:00:00.000Z'))
    expect(morning.toISOString()).toBe(evening.toISOString())
  })
})

describe('formatZonedDateLong', () => {
  test('Indonesian long format respects TZ', () => {
    const witaLabel = formatZonedDateLong('Asia/Makassar', REF_UTC)
    expect(witaLabel).toContain('Senin')   // 2026-05-18 is Monday
    expect(witaLabel).toContain('18')
    expect(witaLabel).toContain('Mei')
    expect(witaLabel).toContain('2026')

    const wibLabel = formatZonedDateLong('Asia/Jakarta', REF_UTC)
    expect(wibLabel).toContain('Minggu')   // 2026-05-17 is Sunday
    expect(wibLabel).toContain('17')
  })
})

describe('formatDateKeyShort', () => {
  test('reads UTC components — already-normalized dateKey', () => {
    const dateKey = new Date(Date.UTC(2026, 4, 18)) // May = index 4
    const label = formatDateKeyShort(dateKey)
    expect(label).toContain('Sen')   // Senin abbrev (Indonesian "Sen")
    expect(label).toContain('18')
    expect(label).toContain('Mei')
  })
})

describe('timezoneShortLabel', () => {
  test('returns short label for known TZ', () => {
    expect(timezoneShortLabel('Asia/Jakarta')).toBe('WIB')
    expect(timezoneShortLabel('Asia/Makassar')).toBe('WITA')
    expect(timezoneShortLabel('Asia/Jayapura')).toBe('WIT')
    expect(timezoneShortLabel('UTC')).toBe('UTC')
  })

  test('falls back to raw value for unknown TZ', () => {
    expect(timezoneShortLabel('Europe/Berlin')).toBe('Europe/Berlin')
  })
})

describe('COMMON_TIMEZONES', () => {
  test('all values resolve via Intl', () => {
    for (const { value } of COMMON_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: value })).not.toThrow()
    }
  })
})

describe('getReportTimezone (DB-backed)', () => {
  const KEY = 'report.timezone'
  let previous: string | null = null

  test('returns DEFAULT_TIMEZONE when setting unset', async () => {
    const existing = await prisma.appSetting.findUnique({ where: { key: KEY } })
    previous = existing?.value ?? null
    await prisma.appSetting.deleteMany({ where: { key: KEY } })
    const tz = await getReportTimezone()
    expect(tz).toBe(DEFAULT_TIMEZONE)
  })

  test('returns saved value when valid', async () => {
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: 'Asia/Makassar' },
      update: { value: 'Asia/Makassar' },
    })
    const tz = await getReportTimezone()
    expect(tz).toBe('Asia/Makassar')
  })

  test('falls back to DEFAULT_TIMEZONE when stored value invalid', async () => {
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: 'Not/AReal_TZ' },
      update: { value: 'Not/AReal_TZ' },
    })
    const tz = await getReportTimezone()
    expect(tz).toBe(DEFAULT_TIMEZONE)
  })

  afterAll(async () => {
    if (previous === null) {
      await prisma.appSetting.deleteMany({ where: { key: KEY } })
    } else {
      await prisma.appSetting.upsert({
        where: { key: KEY },
        create: { key: KEY, value: previous },
        update: { value: previous },
      })
    }
  })
})
