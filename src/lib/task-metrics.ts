// Business rule: IDEA tasks are backlog captures ("biar tidak lupa"), not
// committed work. They must be excluded from every workload/health metric so a
// pile of un-triaged ideas can't drag down project health, inflate team load,
// or surface as overdue/stale. TICKET counts as real work and is NOT excluded.
// Spread this into a prisma.task `where` clause: { ...WORKLOAD_KIND_FILTER }.
// Not `as const` — Prisma's `notIn` expects a mutable TaskKind[], not a readonly tuple.
export const WORKLOAD_KIND_FILTER = { kind: { notIn: ['IDEA' as const] } }

// Same intent as WORKLOAD_KIND_FILTER but also drops soft-deleted (trashed)
// tasks. Use this ONLY where the `task` soft-delete extension can't reach —
// i.e. when `task` appears as a RELATION inside another model's `where`
// (`taskStatusChange.findMany({ where: { task: {...} } })`) or in a relation
// count/include. Direct `prisma.task.*` reads already get `deletedAt: null`
// injected by the extension, so keep using WORKLOAD_KIND_FILTER there.
export const ACTIVE_TASK_FILTER = { deletedAt: null, kind: { notIn: ['IDEA' as const] } }
