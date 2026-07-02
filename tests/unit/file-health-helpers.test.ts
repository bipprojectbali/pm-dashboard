import { describe, expect, test } from 'bun:test'
import { filterFiles, sortFiles } from '../../src/frontend/components/filehealthpanel/helpers'
import type { FileHealth } from '../../src/frontend/components/filehealthpanel/types'

function mk(path: string, lines: number, chars: number, pct: number, status: FileHealth['status']): FileHealth {
  return {
    path,
    type: 'other',
    lines,
    chars,
    limitLines: 500,
    limitChars: 20000,
    pctLines: pct,
    pctChars: pct,
    pct,
    status,
  }
}

const FILES: FileHealth[] = [
  mk('src/app.ts', 100, 3000, 20, 'ok'),
  mk('src/routes/big.route.ts', 480, 18000, 96, 'warning'),
  mk('src/lib/huge.ts', 620, 24000, 124, 'over'),
  mk('src/frontend/Small.tsx', 40, 900, 8, 'ok'),
]

describe('filterFiles — status bucket', () => {
  test('all returns every file', () => {
    expect(filterFiles(FILES, 'all', '')).toHaveLength(4)
  })

  test('over returns only over-limit files', () => {
    const r = filterFiles(FILES, 'over', '')
    expect(r).toHaveLength(1)
    expect(r[0].path).toBe('src/lib/huge.ts')
  })

  test('warning returns warning + over (excludes ok)', () => {
    const r = filterFiles(FILES, 'warning', '')
    expect(r).toHaveLength(2)
    expect(r.every((f) => f.status !== 'ok')).toBe(true)
  })
})

describe('filterFiles — path search', () => {
  test('substring match is case-insensitive', () => {
    const r = filterFiles(FILES, 'all', 'ROUTE')
    expect(r).toHaveLength(1)
    expect(r[0].path).toBe('src/routes/big.route.ts')
  })

  test('search composes with status filter', () => {
    // 'src' matches all, but status=over narrows to the one over-limit file
    const r = filterFiles(FILES, 'over', 'src')
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('over')
  })

  test('no match returns empty', () => {
    expect(filterFiles(FILES, 'all', 'zzz-nope')).toHaveLength(0)
  })

  test('whitespace-only search is ignored', () => {
    expect(filterFiles(FILES, 'all', '   ')).toHaveLength(4)
  })
})

describe('sortFiles', () => {
  test('lines desc puts largest first', () => {
    const r = sortFiles(FILES, 'lines', 'desc')
    expect(r.map((f) => f.lines)).toEqual([620, 480, 100, 40])
  })

  test('lines asc puts smallest first', () => {
    const r = sortFiles(FILES, 'lines', 'asc')
    expect(r.map((f) => f.lines)).toEqual([40, 100, 480, 620])
  })

  test('path asc is alphabetical', () => {
    const r = sortFiles(FILES, 'path', 'asc')
    expect(r[0].path).toBe('src/app.ts')
    expect(r[r.length - 1].path).toBe('src/routes/big.route.ts')
  })

  test('status desc ranks over > warning > ok', () => {
    const r = sortFiles(FILES, 'status', 'desc')
    expect(r[0].status).toBe('over')
    expect(r[r.length - 1].status).toBe('ok')
  })

  test('does not mutate the input array', () => {
    const before = FILES.map((f) => f.path)
    sortFiles(FILES, 'pct', 'desc')
    expect(FILES.map((f) => f.path)).toEqual(before)
  })

  test('ties fall back to path ascending', () => {
    // two 'ok' files (pct 20 and 8) — sorting by status keeps deterministic path order within the bucket
    const r = sortFiles(FILES, 'status', 'asc')
    const okPaths = r.filter((f) => f.status === 'ok').map((f) => f.path)
    expect(okPaths).toEqual(['src/app.ts', 'src/frontend/Small.tsx'])
  })
})
