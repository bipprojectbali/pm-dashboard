import type { PrismaClient } from '../../generated/prisma'

// Task uses soft-delete: DELETE sets `deletedAt` and the row lingers in Trash
// until purged. Every user-facing read must exclude trashed rows, but the
// aggregation libs (overview/retro/effort/chat) each build their own `where`
// and historically forgot `deletedAt: null` — so trashed tasks kept inflating
// KPIs, overdue counts, health scores, and retros.
//
// Instead of patching ~30 call sites, this client extension injects
// `deletedAt: null` into every Task READ that doesn't already mention
// `deletedAt`. Callers that need to see the Trash (list-trash, restore, purge)
// opt out simply by referencing `deletedAt` themselves (e.g. `{ not: null }`);
// their explicit clause is preserved and wins.
//
// LIMITATION — this only rewrites operations on the Task model itself. It does
// NOT filter:
//   • relation counts: `project.findMany({ _count: { tasks: true } })`
//   • relation filters from other models: `taskStatusChange.findMany({ where: { task: {...} } })`
//   • nested includes: `project.findMany({ include: { tasks: {...} } })`
// Those spots must add `deletedAt: null` by hand (see ACTIVE_TASK_FILTER).

// Read operations where an implicit `deletedAt: null` is safe and wanted.
const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
])

function hasDeletedAt(where: unknown): boolean {
  return typeof where === 'object' && where !== null && 'deletedAt' in where
}

export function withSoftDelete(client: PrismaClient) {
  return client.$extends({
    name: 'task-soft-delete',
    query: {
      task: {
        $allOperations({ operation, args, query }) {
          if (READ_OPS.has(operation)) {
            const a = (args ?? {}) as { where?: Record<string, unknown> }
            // Respect an explicit deletedAt (Trash views ask for `{ not: null }`).
            if (!hasDeletedAt(a.where)) {
              a.where = { ...a.where, deletedAt: null }
            }
            return query(a)
          }
          return query(args)
        },
      },
    },
  })
}
