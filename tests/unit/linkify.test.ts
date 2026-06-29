import { describe, expect, test } from 'bun:test'
import { parseLinks } from '../../src/frontend/lib/linkify'

describe('parseLinks', () => {
  test('plain text with no URL returns a single text segment', () => {
    const segs = parseLinks('just a note about the project')
    expect(segs).toEqual([{ type: 'text', value: 'just a note about the project' }])
  })

  test('detects a bare https URL', () => {
    const segs = parseLinks('https://localhost:3111')
    expect(segs).toEqual([{ type: 'link', value: 'https://localhost:3111', href: 'https://localhost:3111' }])
  })

  test('splits text around a URL in the middle', () => {
    const segs = parseLinks('link = https://example.com here')
    expect(segs).toEqual([
      { type: 'text', value: 'link = ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ' here' },
    ])
  })

  test('detects multiple URLs', () => {
    const segs = parseLinks('a http://a.com b https://b.org')
    expect(segs.filter((s) => s.type === 'link').map((s) => s.value)).toEqual(['http://a.com', 'https://b.org'])
  })

  test('does not include trailing punctuation in the URL', () => {
    const segs = parseLinks('see https://example.com.')
    const link = segs.find((s) => s.type === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(segs.at(-1)).toEqual({ type: 'text', value: '.' })
  })

  test('ignores non-http schemes', () => {
    const segs = parseLinks('ftp://files.example.com and ws://x')
    expect(segs.every((s) => s.type === 'text')).toBe(true)
  })

  test('empty string returns no segments', () => {
    expect(parseLinks('')).toEqual([])
  })
})
