/**
 * Pure list logic for the `auth.signupAllowlist` app setting. No React, no
 * fetch — so the parse/serialize round-trip can be unit tested on its own.
 *
 * Stored format (decided with the enforcement gate, do not change): email
 * addresses separated by newlines and/or commas, surrounding whitespace
 * tolerated. An absent or empty value means *nobody* may sign up — the list is
 * fail-closed, so an empty array is a valid, deliberate state and never an
 * error.
 */

/** Delimiters of the stored format. An entry may never contain one of these. */
const SEPARATORS = /[\n,]+/

/**
 * Deliberately stricter than the RFC: no whitespace, no delimiter character,
 * and at least one dot in the domain. The gate compares case-insensitively, so
 * this only has to reject shapes a human would recognise as a typo — the real
 * check is whether that person can receive mail, which no regex can answer.
 */
const EMAIL_SHAPE = /^[^\s@,]+@[^\s@,.]+(\.[^\s@,.]+)+$/

export function isValidEmailShape(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim())
}

/**
 * Stored string → entries, in stored order. Blank entries are dropped and
 * case-insensitive duplicates collapse to their first occurrence, so a list
 * hand-edited in the database still reads back as the set the gate sees.
 */
export function parseAllowlist(stored: string | null | undefined): string[] {
  if (!stored) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of stored.split(SEPARATORS)) {
    const entry = raw.trim()
    if (!entry) continue
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }
  return result
}

/**
 * Entries → stored string. Newline-separated: the value is read back by both
 * the gate and a human opening the settings row, and one address per line is
 * the form that stays readable as the list grows.
 */
export function serializeAllowlist(emails: string[]): string {
  return emails.join('\n')
}

export function hasEmail(emails: string[], candidate: string): boolean {
  const key = candidate.trim().toLowerCase()
  return emails.some((e) => e.toLowerCase() === key)
}

export type AddFailure = 'empty' | 'invalid' | 'duplicate'

export type AddResult = { ok: true; emails: string[] } | { ok: false; reason: AddFailure }

/**
 * Returns a new list rather than mutating, and reports *why* it refused so the
 * panel can say so in Indonesian without duplicating the rules.
 */
export function addEmail(emails: string[], candidate: string): AddResult {
  const entry = candidate.trim()
  if (!entry) return { ok: false, reason: 'empty' }
  if (!isValidEmailShape(entry)) return { ok: false, reason: 'invalid' }
  if (hasEmail(emails, entry)) return { ok: false, reason: 'duplicate' }
  return { ok: true, emails: [...emails, entry] }
}

/** Case-insensitive, matching how the gate compares. */
export function removeEmail(emails: string[], target: string): string[] {
  const key = target.trim().toLowerCase()
  return emails.filter((e) => e.toLowerCase() !== key)
}

/** True when the two lists hold the same addresses in the same order. */
export function sameAllowlist(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i])
}
