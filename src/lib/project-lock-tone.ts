// The visible half of the overdue forcing function: a project past its
// deadline has to look wrong, so somebody decides. This module is the single
// source of truth for "which stages are red and how hard" — the frontend reads
// it to pick a `data-lock-tone` value and the unit tests read it directly.
//
// Pure on purpose: no React, no Prisma, no DOM. The only import is a type, which
// is erased at build time, so pulling this into the browser bundle does not drag
// `project-lock.ts` (and its Prisma-backed settings lookup) along with it. Keep
// it that way — a value import from './project-lock' here would break the build.
import type { LockStage } from './project-lock'

export type LockTone = 'neutral' | 'danger'

// Severity rungs inside the red band, also the `data-lock-tone` attribute value
// the stylesheet keys off. One rung per past-deadline stage.
export type LockToneAttr = 'overdue' | 'escalated' | 'locked'

export type LockToneInfo = {
  tone: LockTone
  // `null` means "render nothing extra": no attribute, no wrapper class, so the
  // subtree keeps exactly today's neutral appearance.
  attr: LockToneAttr | null
}

const NEUTRAL: LockToneInfo = { tone: 'neutral', attr: null }

const BY_STAGE: Record<LockStage, LockToneInfo> = {
  EXEMPT: NEUTRAL,
  ON_TIME: NEUTRAL,
  // Deliberately neutral. A deadline that is merely near has nothing to decide
  // yet, and an amber "warning" tier was explicitly not asked for — red starts
  // the day the deadline is actually missed.
  DUE_SOON: NEUTRAL,
  OVERDUE: { tone: 'danger', attr: 'overdue' },
  ESCALATED: { tone: 'danger', attr: 'escalated' },
  LOCKED: { tone: 'danger', attr: 'locked' },
}

// Tolerates null/undefined because the client often has no lock object yet —
// while the detail query is loading, or for a payload that predates the field.
export function lockTone(stage: LockStage | null | undefined): LockToneInfo {
  if (!stage) return NEUTRAL
  return BY_STAGE[stage] ?? NEUTRAL
}
