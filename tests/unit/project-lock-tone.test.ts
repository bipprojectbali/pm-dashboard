import { describe, expect, test } from 'bun:test'
import type { LockStage } from '../../src/lib/project-lock'
import { lockTone, type LockToneAttr } from '../../src/lib/project-lock-tone'

// Every stage the backend can produce. Kept as an explicit list rather than
// derived from the mapping, so adding a stage without deciding its tone fails
// here instead of silently defaulting to neutral in the UI.
const ALL_STAGES: LockStage[] = ['EXEMPT', 'ON_TIME', 'DUE_SOON', 'OVERDUE', 'ESCALATED', 'LOCKED']

const NEUTRAL_STAGES: LockStage[] = ['EXEMPT', 'ON_TIME', 'DUE_SOON']
const DANGER_STAGES: LockStage[] = ['OVERDUE', 'ESCALATED', 'LOCKED']

describe('lockTone — stage neutral', () => {
  for (const stage of NEUTRAL_STAGES) {
    test(`${stage} tetap netral dan tidak merender atribut`, () => {
      expect(lockTone(stage)).toEqual({ tone: 'neutral', attr: null })
    })
  }

  // The one that is easy to get wrong: DUE_SOON is before the deadline, so it
  // must NOT be tinted. No amber tier either — red starts when the date passes.
  test('DUE_SOON tidak memicu warna apa pun', () => {
    expect(lockTone('DUE_SOON').tone).toBe('neutral')
    expect(lockTone('DUE_SOON').attr).toBeNull()
  })
})

describe('lockTone — stage merah', () => {
  const expected: Record<string, LockToneAttr> = {
    OVERDUE: 'overdue',
    ESCALATED: 'escalated',
    LOCKED: 'locked',
  }

  for (const stage of DANGER_STAGES) {
    test(`${stage} merah dengan rung ${expected[stage]}`, () => {
      expect(lockTone(stage)).toEqual({ tone: 'danger', attr: expected[stage] })
    })
  }

  test('setiap stage lewat deadline punya rung yang berbeda', () => {
    const attrs = DANGER_STAGES.map((s) => lockTone(s).attr)
    expect(new Set(attrs).size).toBe(DANGER_STAGES.length)
  })
})

describe('lockTone — input tanpa stage', () => {
  // The client has no lock object while the detail query is still loading.
  test('null dan undefined jatuh ke netral, bukan merah', () => {
    expect(lockTone(null)).toEqual({ tone: 'neutral', attr: null })
    expect(lockTone(undefined)).toEqual({ tone: 'neutral', attr: null })
  })

  // Failure case: a payload from an older/newer server with a stage this build
  // does not know must degrade to the neutral look, never throw.
  test('stage tak dikenal tidak melempar dan dianggap netral', () => {
    const rogue = 'SOMETHING_ELSE' as LockStage
    expect(() => lockTone(rogue)).not.toThrow()
    expect(lockTone(rogue)).toEqual({ tone: 'neutral', attr: null })
  })
})

describe('lockTone — kelengkapan', () => {
  test('semua stage terpetakan: tepat 3 netral, 3 merah', () => {
    const danger = ALL_STAGES.filter((s) => lockTone(s).tone === 'danger')
    const neutral = ALL_STAGES.filter((s) => lockTone(s).tone === 'neutral')
    expect(danger).toEqual(DANGER_STAGES)
    expect(neutral).toEqual(NEUTRAL_STAGES)
  })

  test('tone dan attr selalu konsisten', () => {
    for (const stage of ALL_STAGES) {
      const { tone, attr } = lockTone(stage)
      // attr is non-null exactly when the tone is red — the UI relies on this to
      // decide whether to render the wrapper class at all.
      expect(attr !== null).toBe(tone === 'danger')
    }
  })
})
