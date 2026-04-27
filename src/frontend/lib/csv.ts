// Lightweight RFC 4180-style CSV utilities for Task bulk import.
// Strict — does not coerce silently; surfaces structured errors.

export const TASK_CSV_HEADERS = [
  'title',
  'description',
  'kind',
  'priority',
  'startsAt',
  'dueAt',
  'estimateHours',
  'assigneeEmail',
  'tagNames',
] as const

export type TaskCsvHeader = (typeof TASK_CSV_HEADERS)[number]

export interface ParsedTaskRow {
  title: string
  description: string
  kind: string
  priority: string
  startsAt: string | null
  dueAt: string | null
  estimateHours: number | null
  assigneeEmail: string | null
  tagNames: string[]
}

export interface RowError {
  index: number
  field: string
  message: string
}

export interface ParseResult {
  rows: ParsedTaskRow[]
  errors: RowError[]
  rawRows: string[][]
}

const KINDS = new Set(['TASK', 'BUG', 'QC'])
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const src = text.replace(/\r\n?/g, '\n')
  while (i < src.length) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      cur.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

export function parseTaskCsv(text: string): ParseResult {
  const errors: RowError[] = []
  const rows: ParsedTaskRow[] = []
  const raw = parseCsvText(text.trim())
  if (raw.length === 0) {
    errors.push({ index: -1, field: '_file', message: 'CSV kosong' })
    return { rows, errors, rawRows: [] }
  }
  const header = raw[0].map((h) => h.trim())
  const missing = TASK_CSV_HEADERS.filter((h) => !header.includes(h))
  if (missing.length) {
    errors.push({
      index: -1,
      field: '_header',
      message: `Header kurang: ${missing.join(', ')}. Wajib: ${TASK_CSV_HEADERS.join(',')}`,
    })
    return { rows, errors, rawRows: raw }
  }
  const idx: Record<TaskCsvHeader, number> = Object.fromEntries(
    TASK_CSV_HEADERS.map((h) => [h, header.indexOf(h)]),
  ) as Record<TaskCsvHeader, number>

  for (let r = 1; r < raw.length; r++) {
    const cols = raw[r]
    const get = (h: TaskCsvHeader) => (cols[idx[h]] ?? '').trim()
    const rowIndex = r - 1
    const title = get('title')
    const description = get('description')
    const kindRaw = get('kind') || 'TASK'
    const priorityRaw = get('priority') || 'MEDIUM'
    const startsAtRaw = get('startsAt')
    const dueAtRaw = get('dueAt')
    const estRaw = get('estimateHours')
    const assigneeEmailRaw = get('assigneeEmail')
    const tagNamesRaw = get('tagNames')

    if (!title) errors.push({ index: rowIndex, field: 'title', message: 'title wajib' })
    else if (title.length > 500) errors.push({ index: rowIndex, field: 'title', message: 'title > 500 char' })
    if (!description) errors.push({ index: rowIndex, field: 'description', message: 'description wajib' })

    const kind = kindRaw.toUpperCase()
    if (!KINDS.has(kind)) errors.push({ index: rowIndex, field: 'kind', message: `kind harus TASK|BUG|QC` })
    const priority = priorityRaw.toUpperCase()
    if (!PRIORITIES.has(priority))
      errors.push({ index: rowIndex, field: 'priority', message: 'priority harus LOW|MEDIUM|HIGH|CRITICAL' })

    let startsAt: string | null = null
    if (startsAtRaw) {
      const d = new Date(startsAtRaw)
      if (Number.isNaN(d.getTime())) errors.push({ index: rowIndex, field: 'startsAt', message: 'tanggal invalid' })
      else startsAt = d.toISOString()
    }
    let dueAt: string | null = null
    if (dueAtRaw) {
      const d = new Date(dueAtRaw)
      if (Number.isNaN(d.getTime())) errors.push({ index: rowIndex, field: 'dueAt', message: 'tanggal invalid' })
      else dueAt = d.toISOString()
    }
    if (startsAt && dueAt && new Date(dueAt) < new Date(startsAt))
      errors.push({ index: rowIndex, field: 'dueAt', message: 'dueAt < startsAt' })

    let estimateHours: number | null = null
    if (estRaw) {
      const n = Number(estRaw)
      if (!Number.isFinite(n) || n < 0)
        errors.push({ index: rowIndex, field: 'estimateHours', message: 'harus angka ≥ 0' })
      else estimateHours = n
    }

    let assigneeEmail: string | null = null
    if (assigneeEmailRaw) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmailRaw))
        errors.push({ index: rowIndex, field: 'assigneeEmail', message: 'email format invalid' })
      else assigneeEmail = assigneeEmailRaw
    }

    const tagNames = tagNamesRaw
      ? tagNamesRaw
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    rows.push({ title, description, kind, priority, startsAt, dueAt, estimateHours, assigneeEmail, tagNames })
  }
  return { rows, errors, rawRows: raw }
}

export function buildSampleCsv(): string {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push(TASK_CSV_HEADERS.join(','))
  lines.push(
    csvRow([
      'Implement login flow',
      'Email + password + Google OAuth. Acceptance: session cookie set, redirect by role.',
      'TASK',
      'HIGH',
      tomorrow,
      nextWeek,
      '6.5',
      '',
      'frontend;auth',
    ]),
  )
  lines.push(
    csvRow([
      'Fix race on /api/tasks reorder',
      'Two clients reorder same column → server returns 409. Repro in tests/integration.',
      'BUG',
      'CRITICAL',
      '',
      nextWeek,
      '3',
      'kurosakiblackangel@gmail.com',
      'backend',
    ]),
  )
  lines.push(
    csvRow([
      'QC: empty state copy review',
      'Check empty states across /pm tabs, list any with placeholder lorem text.',
      'QC',
      'LOW',
      '',
      '',
      '',
      '',
      '',
    ]),
  )
  return lines.join('\n') + '\n'
}

function csvRow(cells: string[]): string {
  return cells
    .map((c) => {
      if (/[,"\n]/.test(c)) return `"${c.replace(/"/g, '""')}"`
      return c
    })
    .join(',')
}

export function downloadSampleCsv() {
  const blob = new Blob([buildSampleCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tasks-sample.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
