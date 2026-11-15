import { describe, expect, test } from 'bun:test'
import {
  addEmail,
  hasEmail,
  isValidEmailShape,
  parseAllowlist,
  removeEmail,
  sameAllowlist,
  serializeAllowlist,
} from '../../src/frontend/components/signupallowlist/helpers'

describe('parseAllowlist', () => {
  test('absent or blank value is an empty list, not an error', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
    expect(parseAllowlist('   \n  , \n')).toEqual([])
  })

  test('splits on newlines and commas and trims surrounding whitespace', () => {
    expect(parseAllowlist('a@x.com\nb@x.com')).toEqual(['a@x.com', 'b@x.com'])
    expect(parseAllowlist('a@x.com,b@x.com')).toEqual(['a@x.com', 'b@x.com'])
    expect(parseAllowlist('  a@x.com ,\n  b@x.com  \n')).toEqual(['a@x.com', 'b@x.com'])
    expect(parseAllowlist('a@x.com,,\n\nb@x.com')).toEqual(['a@x.com', 'b@x.com'])
  })

  test('collapses case-insensitive duplicates to the first occurrence', () => {
    expect(parseAllowlist('Budi@X.com\nbudi@x.com\nBUDI@X.COM')).toEqual(['Budi@X.com'])
  })
})

describe('serializeAllowlist', () => {
  test('one address per line', () => {
    expect(serializeAllowlist(['a@x.com', 'b@x.com'])).toBe('a@x.com\nb@x.com')
    expect(serializeAllowlist([])).toBe('')
  })

  test('round-trips a messy stored value into its canonical form', () => {
    const stored = ' a@x.com ,\n\n B@X.com \n a@X.COM '
    const canonical = serializeAllowlist(parseAllowlist(stored))
    expect(canonical).toBe('a@x.com\nB@X.com')
    expect(parseAllowlist(canonical)).toEqual(['a@x.com', 'B@X.com'])
  })
})

describe('isValidEmailShape', () => {
  test('accepts ordinary addresses, including +tag and subdomains', () => {
    expect(isValidEmailShape('budi@wibudev.com')).toBe(true)
    expect(isValidEmailShape('budi+pm@wibudev.com')).toBe(true)
    expect(isValidEmailShape('budi@mail.wibudev.co.id')).toBe(true)
    expect(isValidEmailShape('  budi@wibudev.com  ')).toBe(true)
  })

  test('rejects typo shapes', () => {
    expect(isValidEmailShape('')).toBe(false)
    expect(isValidEmailShape('budi')).toBe(false)
    expect(isValidEmailShape('budi@')).toBe(false)
    expect(isValidEmailShape('@wibudev.com')).toBe(false)
    expect(isValidEmailShape('budi@wibudev')).toBe(false)
    expect(isValidEmailShape('budi@@wibudev.com')).toBe(false)
  })

  test('rejects an entry carrying a delimiter, which would corrupt the stored format', () => {
    expect(isValidEmailShape('a@x.com,b@x.com')).toBe(false)
    expect(isValidEmailShape('a@x.com\nb@x.com')).toBe(false)
    expect(isValidEmailShape('a b@x.com')).toBe(false)
  })
})

describe('hasEmail', () => {
  test('matches case-insensitively, as the gate compares', () => {
    expect(hasEmail(['Budi@X.com'], 'budi@x.com')).toBe(true)
    expect(hasEmail(['Budi@X.com'], '  BUDI@X.COM ')).toBe(true)
    expect(hasEmail(['Budi@X.com'], 'siti@x.com')).toBe(false)
    expect(hasEmail([], 'budi@x.com')).toBe(false)
  })
})

describe('addEmail', () => {
  test('appends a valid address without mutating the input', () => {
    const before = ['a@x.com']
    const result = addEmail(before, '  b@x.com ')
    expect(result).toEqual({ ok: true, emails: ['a@x.com', 'b@x.com'] })
    expect(before).toEqual(['a@x.com'])
  })

  test('refuses blank, malformed, and case-insensitively duplicate entries', () => {
    expect(addEmail([], '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(addEmail([], 'budi')).toEqual({ ok: false, reason: 'invalid' })
    expect(addEmail(['Budi@X.com'], 'budi@x.com')).toEqual({ ok: false, reason: 'duplicate' })
  })

  test('validates shape before duplication, so a typo is reported as a typo', () => {
    expect(addEmail(['budi'], 'budi')).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('removeEmail', () => {
  test('removes case-insensitively and leaves the rest in order', () => {
    expect(removeEmail(['a@x.com', 'B@x.com', 'c@x.com'], 'b@X.COM')).toEqual(['a@x.com', 'c@x.com'])
  })

  test('removing an absent address is a no-op', () => {
    expect(removeEmail(['a@x.com'], 'z@x.com')).toEqual(['a@x.com'])
  })

  test('removing the last address leaves the closed-signup empty state', () => {
    expect(removeEmail(['a@x.com'], 'a@x.com')).toEqual([])
  })
})

describe('sameAllowlist', () => {
  test('detects whether the edited list still matches what was stored', () => {
    expect(sameAllowlist(['a@x.com'], ['a@x.com'])).toBe(true)
    expect(sameAllowlist([], [])).toBe(true)
    expect(sameAllowlist(['a@x.com'], ['a@x.com', 'b@x.com'])).toBe(false)
    expect(sameAllowlist(['a@x.com', 'b@x.com'], ['b@x.com', 'a@x.com'])).toBe(false)
    expect(sameAllowlist(['a@x.com'], ['A@X.com'])).toBe(false)
  })
})
