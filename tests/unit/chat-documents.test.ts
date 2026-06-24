import { describe, expect, test } from 'bun:test'
import { extractKeywords } from '../../src/lib/chat-documents'

describe('extractKeywords', () => {
  test('lowercases tokens and joins with pipe', () => {
    const out = extractKeywords('proyek wayang task overdue')
    expect(out).toContain('proyek')
    expect(out).toContain('wayang')
    expect(out).toContain('task')
    expect(out).toContain('overdue')
    expect(out).toContain('|')
  })

  test('filters Indonesian stopwords', () => {
    const out = extractKeywords('siapa yang paling banyak commit minggu ini')
    expect(out).not.toMatch(/\bsiapa\b/)
    expect(out).not.toMatch(/\byang\b/)
    expect(out).not.toMatch(/\bpaling\b/)
    expect(out).not.toMatch(/\bini\b/)
    expect(out).toContain('commit')
    expect(out).toContain('banyak')
    expect(out).toContain('minggu')
  })

  test('keeps capitalized proper nouns even when short', () => {
    const out = extractKeywords('Status Bagas hari ini')
    expect(out).toContain('bagas')
    expect(out).toContain('status')
  })

  test('drops words shorter than 3 chars (except capitalized names)', () => {
    const out = extractKeywords('a be cd def')
    expect(out).not.toMatch(/(^|\| )a( |\||$)/)
    expect(out).not.toMatch(/(^|\| )be( |\||$)/)
    expect(out).toContain('def')
  })

  test('strips punctuation', () => {
    const out = extractKeywords('Task "Login" — fix bug!')
    expect(out).toContain('task')
    expect(out).toContain('login')
    expect(out).toContain('fix')
    expect(out).toContain('bug')
    expect(out).not.toContain('"')
    expect(out).not.toContain('—')
  })

  test('deduplicates tokens', () => {
    const out = extractKeywords('task task task laporan laporan')
    const tokens = out.split(' | ').filter(Boolean)
    expect(tokens.filter((t) => t === 'task').length).toBe(1)
    expect(tokens.filter((t) => t === 'laporan').length).toBe(1)
  })

  test('returns empty string when only stopwords', () => {
    const out = extractKeywords('yang ini di ke dari')
    expect(out).toBe('')
  })
})
