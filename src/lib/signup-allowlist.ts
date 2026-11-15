import { getSetting } from './app-settings'
import { env } from './env'

export const SIGNUP_ALLOWLIST_SETTING_KEY = 'auth.signupAllowlist'

/**
 * Single user-facing rejection message. Deliberately identical for every
 * rejection reason: a message that varied by cause would answer "does this
 * address already have an account" / "is it on the list" for anyone probing.
 */
export const SIGNUP_CLOSED_MESSAGE = 'Pendaftaran akun baru sedang ditutup. Hubungi admin sistem.'

export type SignupReason = 'allowlist' | 'super-admin' | 'closed'

export interface SignupDecision {
  allowed: boolean
  reason: SignupReason
  /** Number of addresses currently parsed out of the allowlist setting. */
  entryCount: number
}

/**
 * Parse the raw setting value into normalized addresses.
 *
 * Pure on purpose — no prisma, no env, no app-settings import — so the parsing
 * and the predicate can be unit-tested without a database.
 *
 * Entries are separated by newlines and/or commas because both shapes arrive in
 * practice: a textarea in the admin UI produces newlines, a copy-pasted list
 * produces commas. Blank entries and surrounding whitespace are dropped, and
 * everything is lowercased so comparison never depends on how the address was typed.
 */
export function parseSignupAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Decide whether `email` may create an account.
 *
 * Fail-closed: an absent or empty allowlist allows nobody. The default state of
 * a deployment is therefore "closed", which is the whole point — an account that
 * has to be created before anyone can notice it is the wrong failure direction
 * for confidential project data.
 *
 * `superAdminEmails` is the bootstrap carve-out, checked after the allowlist so
 * `reason: 'super-admin'` means "allowed *only* because of the carve-out".
 */
export function decideSignup(
  email: string | null | undefined,
  rawAllowlist: string | null | undefined,
  superAdminEmails: readonly string[],
): SignupDecision {
  const entries = parseSignupAllowlist(rawAllowlist)
  const normalized = (email ?? '').trim().toLowerCase()

  if (!normalized) return { allowed: false, reason: 'closed', entryCount: entries.length }
  if (entries.includes(normalized)) return { allowed: true, reason: 'allowlist', entryCount: entries.length }

  const superAdmins = superAdminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (superAdmins.includes(normalized)) return { allowed: true, reason: 'super-admin', entryCount: entries.length }

  return { allowed: false, reason: 'closed', entryCount: entries.length }
}

/**
 * Read the live allowlist + env carve-out and return the verdict.
 *
 * No cache: `getSetting` is one indexed primary-key lookup and signup is a rare
 * event, so caching here would buy nothing measurable while adding a coherence
 * problem — a stale cache on this path means either a new hire who cannot sign
 * up or a removed address that still can.
 */
export async function resolveSignupDecision(email: string | null | undefined): Promise<SignupDecision> {
  const raw = await getSetting(SIGNUP_ALLOWLIST_SETTING_KEY)
  return decideSignup(email, raw, env.SUPER_ADMIN_EMAILS)
}
