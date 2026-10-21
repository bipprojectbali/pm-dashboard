import { describe, expect, test } from 'bun:test'
import {
  computeLockState,
  DUE_SOON_LEAD_DAYS,
  escalateAfterDays,
  type LockableProject,
  type LockStage,
} from '../../src/lib/project-lock'

const NOW = new Date('2026-06-15T00:00:00.000Z')
const DAY_MS = 86_400_000

function project(overrides: Partial<LockableProject> = {}): LockableProject {
  return { endsAt: null, status: 'ACTIVE', archivedAt: null, ...overrides }
}

function endingDaysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS)
}

describe('escalateAfterDays', () => {
  test('separuh grace, dibulatkan ke atas', () => {
    expect(escalateAfterDays(7)).toBe(4)
    expect(escalateAfterDays(10)).toBe(5)
  })

  test('minimal 1 hari supaya eskalasi tidak menyatu dengan H+0', () => {
    expect(escalateAfterDays(0)).toBe(1)
    expect(escalateAfterDays(1)).toBe(1)
  })
})

describe('computeLockState — project yang tidak bisa terkunci', () => {
  test('tanpa deadline', () => {
    const state = computeLockState(project({ endsAt: null }), 7, NOW)
    expect(state.stage).toBe('EXEMPT')
    expect(state.locked).toBe(false)
  })

  test('sudah diarsip', () => {
    const state = computeLockState(
      project({ endsAt: endingDaysFromNow(-100), archivedAt: NOW }),
      7,
      NOW,
    )
    expect(state.stage).toBe('EXEMPT')
  })

  // Setiap status non-ACTIVE sudah berupa keputusan; mengunci berarti menuntut
  // keputusan yang sudah diambil.
  test.each(['DRAFT', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])('status %s', (status: string) => {
    const state = computeLockState(project({ endsAt: endingDaysFromNow(-100), status }), 7, NOW)
    expect(state.stage).toBe('EXEMPT')
    expect(state.locked).toBe(false)
  })
})

describe('computeLockState — tangga tahapan (grace 7 hari)', () => {
  test('deadline masih jauh', () => {
    const state = computeLockState(project({ endsAt: endingDaysFromNow(30) }), 7, NOW)
    expect(state.stage).toBe('ON_TIME')
    expect(state.overdueDays).toBe(-30)
  })

  test('tepat di batas peringatan awal', () => {
    const state = computeLockState(project({ endsAt: endingDaysFromNow(DUE_SOON_LEAD_DAYS) }), 7, NOW)
    expect(state.stage).toBe('DUE_SOON')
  })

  test('sehari sebelum batas peringatan masih ON_TIME', () => {
    const state = computeLockState(
      project({ endsAt: endingDaysFromNow(DUE_SOON_LEAD_DAYS + 1) }),
      7,
      NOW,
    )
    expect(state.stage).toBe('ON_TIME')
  })

  test.each([
    [0, 'OVERDUE'],
    [3, 'OVERDUE'],
    [4, 'ESCALATED'],
    [6, 'ESCALATED'],
    [7, 'LOCKED'],
    [40, 'LOCKED'],
  ] as [number, LockStage][])('overdue %i hari → %s', (overdue: number, expected: LockStage) => {
    const state = computeLockState(project({ endsAt: endingDaysFromNow(-overdue) }), 7, NOW)
    expect(state.stage).toBe(expected)
    expect(state.overdueDays).toBe(overdue)
    expect(state.locked).toBe(expected === 'LOCKED')
  })

  test('lockAt = deadline + grace', () => {
    const endsAt = endingDaysFromNow(-2)
    const state = computeLockState(project({ endsAt }), 7, NOW)
    expect(state.lockAt?.getTime()).toBe(endsAt.getTime() + 7 * DAY_MS)
    expect(state.graceDays).toBe(7)
  })
})

describe('computeLockState — grace ekstrem', () => {
  test('grace 0 mengunci tepat saat deadline lewat', () => {
    expect(computeLockState(project({ endsAt: endingDaysFromNow(0) }), 0, NOW).locked).toBe(true)
    expect(computeLockState(project({ endsAt: endingDaysFromNow(1) }), 0, NOW).locked).toBe(false)
  })

  test('grace besar menunda kunci tanpa menghilangkan tahapan', () => {
    const state = computeLockState(project({ endsAt: endingDaysFromNow(-30) }), 365, NOW)
    expect(state.locked).toBe(false)
    expect(state.stage).toBe('OVERDUE')
  })
})
