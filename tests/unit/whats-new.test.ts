import { test, expect, describe } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  parseChangelog,
  compareVersions,
  getVersionsSince,
} from '../../src/frontend/lib/parse-changelog'

// Baca CHANGELOG.md langsung — menghindari Vite ?raw yang tidak berjalan di Bun test
const changelogRaw = readFileSync(resolve(import.meta.dir, '../../CHANGELOG.md'), 'utf-8')
const WHATS_NEW = parseChangelog(changelogRaw)

// ─── parseChangelog ──────────────────────────────────────────────────────────

describe('parseChangelog', () => {
  const sample = `# Changelog

## [1.2.0] - 2026-06-01

### Ditambahkan
- Fitur baru A
- Fitur baru B

### Diperbaiki
- Bug C

### Ditingkatkan
- Peningkatan D

## [1.1.0] - 2026-05-01

### Ditambahkan
- Fitur lama

## [1.0.0] - 2026-04-01

### Diperbaiki
- Fix awal
`

  test('parses version and date', () => {
    const result = parseChangelog(sample)
    expect(result[0].version).toBe('1.2.0')
    expect(result[0].date).toBe('2026-06-01')
  })

  test('maps section headings to ChangeKind correctly', () => {
    const result = parseChangelog(sample)
    const kinds = result[0].entries.map((e) => e.kind)
    expect(kinds).toContain('feature')
    expect(kinds).toContain('fix')
    expect(kinds).toContain('improvement')
  })

  test('extracts bullet text', () => {
    const result = parseChangelog(sample)
    const texts = result[0].entries.map((e) => e.text)
    expect(texts).toContain('Fitur baru A')
    expect(texts).toContain('Bug C')
  })

  test('skips versions with no matching sections', () => {
    const noSections = `# Log\n\n## [2.0.0] - 2026-01-01\n\nCatatan saja, tanpa section.\n`
    expect(parseChangelog(noSections)).toHaveLength(0)
  })

  test('ignores bullets outside known sections', () => {
    const mixed = `# Log\n\n## [1.0.0] - 2026-01-01\n\n- bukan di bawah section\n\n### Ditambahkan\n- valid\n`
    const result = parseChangelog(mixed)
    expect(result[0].entries).toHaveLength(1)
    expect(result[0].entries[0].text).toBe('valid')
  })

  test('handles English section names (Added/Fixed/Changed)', () => {
    const english = `# Log\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- item\n### Fixed\n- fix\n### Changed\n- change\n`
    const result = parseChangelog(english)
    const kinds = result[0].entries.map((e) => e.kind)
    expect(kinds).toContain('feature')
    expect(kinds).toContain('fix')
    expect(kinds).toContain('improvement')
  })
})

// ─── CHANGELOG.md integrity ──────────────────────────────────────────────────

describe('CHANGELOG.md parsed result', () => {
  test('tidak kosong', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0)
  })

  test('versi terbaru ada di indeks 0', () => {
    for (let i = 0; i < WHATS_NEW.length - 1; i++) {
      expect(compareVersions(WHATS_NEW[i].version, WHATS_NEW[i + 1].version)).toBeGreaterThan(0)
    }
  })

  test('setiap entry punya kind yang valid', () => {
    const valid = new Set(['feature', 'fix', 'improvement'])
    for (const v of WHATS_NEW) {
      for (const e of v.entries) {
        expect(valid.has(e.kind)).toBe(true)
      }
    }
  })

  test('setiap entry punya teks non-kosong', () => {
    for (const v of WHATS_NEW) {
      for (const e of v.entries) {
        expect(e.text.trim().length).toBeGreaterThan(0)
      }
    }
  })
})

// ─── compareVersions ─────────────────────────────────────────────────────────

describe('compareVersions', () => {
  test('same → 0', () => expect(compareVersions('1.2.3', '1.2.3')).toBe(0))
  test('major wins', () => expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0))
  test('minor wins', () => expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0))
  test('patch wins', () => expect(compareVersions('0.4.6', '0.4.5')).toBeGreaterThan(0))
})

// ─── getVersionsSince ─────────────────────────────────────────────────────────

describe('getVersionsSince', () => {
  test('null → hanya versi terbaru', () => {
    const result = getVersionsSince(WHATS_NEW, null)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe(WHATS_NEW[0].version)
  })

  test('versi terlama → semua yang lebih baru, terbaru di atas', () => {
    const oldest = WHATS_NEW[WHATS_NEW.length - 1].version
    const result = getVersionsSince(WHATS_NEW, oldest)
    expect(result.length).toBe(WHATS_NEW.length - 1)
    for (let i = 0; i < result.length - 1; i++) {
      expect(compareVersions(result[i].version, result[i + 1].version)).toBeGreaterThan(0)
    }
  })

  test('versi terkini → array kosong', () => {
    expect(getVersionsSince(WHATS_NEW, WHATS_NEW[0].version)).toHaveLength(0)
  })

  test('versi masa depan → array kosong', () => {
    expect(getVersionsSince(WHATS_NEW, '99.0.0')).toHaveLength(0)
  })
})
