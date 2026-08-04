import { describe, expect, test } from 'bun:test'
import { countdown } from '../../src/frontend/lib/dates'

function isoAt(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

describe('countdown', () => {
  test('event later today is "Hari ini" regardless of hours remaining', () => {
    expect(countdown(isoAt(1)).label).toBe('Hari ini')
  })

  test('event tomorrow just past midnight is "Besok", not "Hari ini" (rolling-24h regression)', () => {
    // Simulates: now is 23:00, event starts 02:00 tomorrow — only 3h away,
    // but it's a different calendar day. A rolling-24h diff would wrongly
    // label this "Hari ini" instead of "Besok".
    const now = new Date()
    const tomorrow2am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0)
    const hoursUntil = (tomorrow2am.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntil <= 0 || hoursUntil >= 24) return // only meaningful when run late in the day; skip otherwise
    expect(countdown(tomorrow2am.toISOString()).label).toBe('Besok')
  })

  test('event exactly 2 calendar days away is "Besok" off-by-one guard: day after tomorrow is not "Besok"', () => {
    const now = new Date()
    const dayAfterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 9, 0, 0)
    expect(countdown(dayAfterTomorrow.toISOString()).label).not.toBe('Besok')
    expect(countdown(dayAfterTomorrow.toISOString()).label).not.toBe('Hari ini')
  })

  test('past event is "Selesai"', () => {
    expect(countdown(isoAt(-2)).label).toBe('Selesai')
  })

  test('event within a week shows "N hari lagi" with yellow color', () => {
    const now = new Date()
    const in5days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 9, 0, 0)
    const result = countdown(in5days.toISOString())
    expect(result.label).toBe('5 hari lagi')
    expect(result.color).toBe('yellow')
  })

  test('event more than a week away shows blue color', () => {
    const now = new Date()
    const in10days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 9, 0, 0)
    expect(countdown(in10days.toISOString()).color).toBe('blue')
  })
})
