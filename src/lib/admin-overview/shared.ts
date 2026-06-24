export const STALE_IN_PROGRESS_MS = 3 * 24 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

export type RiskSeverity = 'none' | 'low' | 'medium' | 'high'
