// Overdue lock: a project whose deadline passed without disposition becomes
// read-only. The lock is a forcing function, not a penalty — being blocked is
// what makes an unhandled project impossible to ignore. Derived from endsAt on
// every read so it can never go stale; there is no stored lock column.
import { getSetting } from './app-settings'

export type LockStage = 'EXEMPT' | 'ON_TIME' | 'DUE_SOON' | 'OVERDUE' | 'ESCALATED' | 'LOCKED'

export type LockState = {
  stage: LockStage
  locked: boolean
  overdueDays: number
  graceDays: number
  lockAt: Date | null
}

export type LockableProject = {
  endsAt: Date | null
  status: string
  archivedAt: Date | null
}

export const LOCK_GRACE_SETTING_KEY = 'project.lockGraceDays'
export const DEFAULT_LOCK_GRACE_DAYS = 7
export const DUE_SOON_LEAD_DAYS = 7

const DAY_MS = 86_400_000
const CACHE_TTL_MS = 60_000

// Only ACTIVE projects can lock. DRAFT has not started, and COMPLETED /
// CANCELLED / ON_HOLD are each already a disposition — locking them would
// demand a decision that was made.
const LOCKABLE_STATUS = 'ACTIVE'

// ponytail: escalation threshold derived from grace, add its own setting if
// teams need to tune the two independently.
export function escalateAfterDays(graceDays: number): number {
  return Math.max(1, Math.ceil(graceDays / 2))
}

export function computeLockState(project: LockableProject, graceDays: number, now: Date = new Date()): LockState {
  const exempt: LockState = {
    stage: 'EXEMPT',
    locked: false,
    overdueDays: 0,
    graceDays,
    lockAt: null,
  }
  if (!project.endsAt || project.archivedAt || project.status !== LOCKABLE_STATUS) return exempt

  const overdueDays = Math.floor((now.getTime() - project.endsAt.getTime()) / DAY_MS)
  const lockAt = new Date(project.endsAt.getTime() + graceDays * DAY_MS)

  let stage: LockStage
  if (overdueDays >= graceDays) stage = 'LOCKED'
  else if (overdueDays >= escalateAfterDays(graceDays)) stage = 'ESCALATED'
  else if (overdueDays >= 0) stage = 'OVERDUE'
  else if (overdueDays >= -DUE_SOON_LEAD_DAYS) stage = 'DUE_SOON'
  else stage = 'ON_TIME'

  return { stage, locked: stage === 'LOCKED', overdueDays, graceDays, lockAt }
}

let _cache: { value: number; expiresAt: number } | null = null

export async function getLockGraceDays(): Promise<number> {
  const now = Date.now()
  if (_cache && _cache.expiresAt > now) return _cache.value
  const raw = await getSetting(LOCK_GRACE_SETTING_KEY)
  const parsed = raw === null ? Number.NaN : Number(raw)
  const value = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_LOCK_GRACE_DAYS
  _cache = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

export function invalidateProjectLockCache(): void {
  _cache = null
}

export async function resolveLockState(project: LockableProject, now?: Date): Promise<LockState> {
  return computeLockState(project, await getLockGraceDays(), now)
}
