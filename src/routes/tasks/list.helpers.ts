// Query-building helpers for GET /api/tasks (list.route.ts). Extracted to keep
// the route handler within the 150-line FILE-HEALTH limit and to make the
// ordering + due-date logic unit-checkable.

import { prisma } from '../../lib/db'

// Prisma `where` fragment that scopes tasks to what a user may see: system
// admins see everything; everyone else sees tasks in a project they're a member
// of OR whose project visibility is INTERNAL/PUBLIC. Shared by GET /api/tasks
// and the kind-board stats endpoint so the two can never drift.
export async function taskVisibilityWhere(auth: {
  userId: string
  isAdmin: boolean
}): Promise<Record<string, unknown>> {
  if (auth.isAdmin) return {}
  const myProjectIds = (
    await prisma.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })
  ).map((m) => m.projectId)
  return {
    project: {
      OR: [{ id: { in: myProjectIds } }, { visibility: 'INTERNAL' as const }, { visibility: 'PUBLIC' as const }],
    },
  }
}

// Sortable columns exposed to the client. `dueAt` and `estimateHours` are
// nullable, so they sort NULLS LAST regardless of direction (an empty due date
// or estimate should never outrank a real value).
const SORTABLE = ['dueAt', 'priority', 'title', 'createdAt', 'updatedAt', 'estimateHours'] as const
const NULLABLE_SORT = new Set(['dueAt', 'estimateHours'])
type SortField = (typeof SORTABLE)[number]

// The default multi-key order when no explicit ?sort= is given. status:asc
// follows the TaskStatus enum (OPEN … CLOSED last) so a truncating `limit`
// drops CLOSED rows before open ones — the Admin Task Triage table depends on
// this (locked by tests/integration/tasks-list-order.test.ts).
const DEFAULT_ORDER_BY = [
  { status: 'asc' as const },
  { kanbanOrder: 'asc' as const },
  { createdAt: 'desc' as const },
  { id: 'asc' as const },
]

function isSortField(s: string): s is SortField {
  return (SORTABLE as readonly string[]).includes(s)
}

// Validate the raw ?sort=/?dir= query params. Returns either an error message
// (→ caller responds 400) or the parsed field (undefined = default order) + dir.
export function parseTaskSort(
  rawSort: unknown,
  rawDir: unknown,
): { error: string } | { field: SortField | undefined; dir: 'asc' | 'desc' } {
  let field: SortField | undefined
  if (rawSort != null && rawSort !== '') {
    const s = String(rawSort)
    if (!isSortField(s)) return { error: `sort must be one of: ${SORTABLE.join(', ')}` }
    field = s
  }
  if (rawDir != null && rawDir !== '' && rawDir !== 'asc' && rawDir !== 'desc') {
    return { error: "dir must be 'asc' or 'desc'" }
  }
  return { field, dir: rawDir === 'desc' ? 'desc' : 'asc' }
}

// Build a Prisma orderBy from the client's sort field + direction. Falls back to
// DEFAULT_ORDER_BY when no sort is requested. Always appends `id: asc` as a
// stable tiebreak so pagination is deterministic across pages. `priority` sorts
// by enum order (LOW < MEDIUM < HIGH < CRITICAL), so asc = LOW→CRITICAL.
export function buildTaskListOrderBy(sort: string | undefined, dir: 'asc' | 'desc'): Record<string, unknown>[] {
  if (!sort) return DEFAULT_ORDER_BY
  const primary = NULLABLE_SORT.has(sort) ? { [sort]: { sort: dir, nulls: 'last' as const } } : { [sort]: dir }
  return [primary, { id: 'asc' as const }]
}

// Merge the mutually-related due-date filters into a single `where.dueAt` value
// so they compose correctly (e.g. overdue AND within a range). Returns a
// discriminated result the caller assigns to `where.dueAt`:
//   { apply: false }                → no due filter, leave `where.dueAt` unset
//   { apply: true, value: null }    → `noDue` (dueAt IS NULL); wins over range
//   { apply: true, value: {...} }   → range: overdue `lt: now` + `gte` + `lte`
// Using `apply` (not a bare null) disambiguates "no filter" from "dueAt = null".
export function buildDueAtCondition(opts: {
  overdueOnly: boolean
  noDue: boolean
  dueFrom?: string
  dueTo?: string
  now?: Date
}): { apply: false } | { apply: true; value: null | Record<string, unknown> } {
  if (opts.noDue) return { apply: true, value: null }
  const now = opts.now ?? new Date()
  const cond: Record<string, unknown> = {}
  if (opts.overdueOnly) cond.lt = now
  if (opts.dueFrom) {
    const from = new Date(opts.dueFrom)
    if (!Number.isNaN(from.getTime())) cond.gte = from
  }
  if (opts.dueTo) {
    const to = new Date(opts.dueTo)
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999)
      cond.lte = to
    }
  }
  return Object.keys(cond).length > 0 ? { apply: true, value: cond } : { apply: false }
}
