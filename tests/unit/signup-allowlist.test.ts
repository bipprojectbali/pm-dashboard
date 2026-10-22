import { describe, expect, test } from 'bun:test'
import { decideSignup, parseSignupAllowlist } from '../../src/lib/signup-allowlist'

describe('parseSignupAllowlist', () => {
  test('comma separated', () => {
    expect(parseSignupAllowlist('a@x.com,b@x.com')).toEqual(['a@x.com', 'b@x.com'])
  })

  test('newline separated', () => {
    expect(parseSignupAllowlist('a@x.com\nb@x.com')).toEqual(['a@x.com', 'b@x.com'])
  })

  test('mixed separators, whitespace and blank entries', () => {
    const raw = '  a@x.com , \n\n b@x.com,\n , c@x.com \n'
    expect(parseSignupAllowlist(raw)).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
  })

  test('lowercases entries', () => {
    expect(parseSignupAllowlist('Budi.Santoso@WibuDev.com')).toEqual(['budi.santoso@wibudev.com'])
  })

  test('absent or empty value yields no entries', () => {
    expect(parseSignupAllowlist(null)).toEqual([])
    expect(parseSignupAllowlist(undefined)).toEqual([])
    expect(parseSignupAllowlist('')).toEqual([])
    expect(parseSignupAllowlist('   \n , \n ')).toEqual([])
  })
})

describe('decideSignup', () => {
  test('allows an address on the list', () => {
    expect(decideSignup('b@x.com', 'a@x.com,b@x.com', [])).toEqual({
      allowed: true,
      reason: 'allowlist',
      entryCount: 2,
    })
  })

  test('comparison is case-insensitive and trimmed on both sides', () => {
    expect(decideSignup('  BUDI@WibuDev.com ', 'budi@wibudev.com', []).allowed).toBe(true)
    expect(decideSignup('budi@wibudev.com', '  BUDI@WibuDev.com  ', []).allowed).toBe(true)
  })

  test('rejects an address not on a populated list', () => {
    expect(decideSignup('intruder@gmail.com', 'a@x.com\nb@x.com', [])).toEqual({
      allowed: false,
      reason: 'closed',
      entryCount: 2,
    })
  })

  test('fails closed when the setting is absent or empty', () => {
    for (const raw of [null, undefined, '', '  \n , ']) {
      expect(decideSignup('anyone@x.com', raw, [])).toEqual({
        allowed: false,
        reason: 'closed',
        entryCount: 0,
      })
    }
  })

  test('super-admin bypass works with an empty allowlist', () => {
    expect(decideSignup('owner@wibudev.com', null, ['owner@wibudev.com'])).toEqual({
      allowed: true,
      reason: 'super-admin',
      entryCount: 0,
    })
  })

  test('super-admin bypass is case-insensitive and ignores blank env entries', () => {
    expect(decideSignup('Owner@WibuDev.com', '', ['', '  owner@wibudev.com  ']).allowed).toBe(true)
  })

  test('allowlist takes precedence over the carve-out in the reported reason', () => {
    expect(decideSignup('owner@x.com', 'owner@x.com', ['owner@x.com']).reason).toBe('allowlist')
  })

  test('a non-super-admin is still rejected when only the carve-out is populated', () => {
    expect(decideSignup('intruder@gmail.com', null, ['owner@wibudev.com'])).toEqual({
      allowed: false,
      reason: 'closed',
      entryCount: 0,
    })
  })

  test('missing or blank email is rejected', () => {
    expect(decideSignup(null, 'a@x.com', ['a@x.com']).allowed).toBe(false)
    expect(decideSignup('   ', 'a@x.com', []).allowed).toBe(false)
  })
})
