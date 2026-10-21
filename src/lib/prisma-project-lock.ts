import { AsyncLocalStorage } from 'node:async_hooks'
import type { PrismaClient } from '../../generated/prisma'
import type { withSoftDelete } from './prisma-soft-delete'

// Overdue lock, enforced at the data layer instead of per route.
//
// `requireProjectMember` downgrading a member to VIEWER only works for routes
// that remember to call it. Routes that gate on something else — reporter
// identity (task trash), a global role (QC), a token scope (/mcp) — wrote to
// locked projects happily. Patching those three is a fix for today; the next
// route added will forget again, because nothing forces an author to know the
// lock exists.
//
// So the invariant moves into the Prisma client: every WRITE on a
// project-scoped model resolves its owning project and refuses if that project
// is locked. A new route/helper/cron/MCP tool is covered without its author
// doing anything. The failure direction inverts too — forgetting the guard now
// denies a legitimate write (loud, safe) instead of silently allowing an
// illegitimate one. The sanctioned ways out of a lock opt out explicitly via
// `withLockBypass`, which greps to a short, auditable list of call sites.
//
// Two exemptions, and only two: a system admin actor (recorded per request by
// the auth layer — see `recordLockActor`, the lock never applied to them) and a
// `withLockBypass` scope. Everything else is refused.
//
// GUARDED (write ops only — reads are untouched, cross-project aggregations in
// admin-overview/retro/effort/task-metrics/chat must keep seeing locked data):
//   • project          — update only. Create has no project to resolve yet, and
//                        delete stays open: a locked project you cannot delete
//                        is a trap, and deletion is already a disposition
//                        restricted to OWNER (blocked by the role downgrade) or
//                        system admin.
//   • own projectId    — task, tag, event, projectMember, projectMilestone,
//                        projectPhase, projectExtension
//   • via parent task  — taskComment, taskEvidence, taskChecklistItem,
//                        taskStatusChange, taskTag, taskDependency
//   • via parent row   — milestoneTag (milestoneId), phaseTag (phaseId)
//
// DELIBERATELY NOT GUARDED:
//   • notification         — the lock sweep and request-decision exist to
//                            notify *about* locked projects; guarding it would
//                            silence the escape hatch.
//   • projectAccessToken   — `verifyProjectToken` stamps lastUsedAt on every
//                            agent request; guarding it breaks reads too.
//   • projectGithubEvent,
//     githubWebhookLog     — inbound webhook ingestion. A refused write here is
//                            data we cannot re-fetch, and it grants no user any
//                            authority over the project.
//   • chatDocument         — assistant scratch content, not project state.
//   • user, session, appSetting, auditLog, reportHistory, eventTag, … — global,
//                            not owned by a project.
//
// LIMITATION — like the soft-delete extension this only sees operations issued
// on the guarded model itself. Nested writes (`project.update({ data: { tasks:
// { create } } })`), `$queryRaw` and `$executeRaw` bypass it. Nothing in the
// codebase writes project-scoped rows that way today.

export const LOCKED_WRITE_MESSAGE =
  'Project terkunci karena overdue — perpanjang deadline, atau tandai selesai/dibatalkan'

export type LockedWriteContext = {
  projectId: string
  projectName: string
  stage: string
  overdueDays: number
  model: string
  operation: string
}

/** Thrown by the client extension; `src/app.ts` maps it to 403 `{ locked: true }`. */
export class ProjectLockedError extends Error {
  readonly status = 403
  readonly locked = true
  readonly context: LockedWriteContext

  constructor(context: LockedWriteContext) {
    super(
      `${LOCKED_WRITE_MESSAGE} [project=${context.projectId} ${context.model}.${context.operation} stage=${context.stage} overdue=${context.overdueDays}d]`,
    )
    this.name = 'ProjectLockedError'
    this.context = context
  }
}

/** Name-based so it survives duplicate module instances (tests, bundling). */
export function isProjectLockedError(err: unknown): err is ProjectLockedError {
  return err instanceof Error && err.name === 'ProjectLockedError'
}

// --- actor ------------------------------------------------------------------

// "System admin tidak terkena" (CLAUDE.md) is a property of the *caller*, which
// a query extension cannot see — so the auth layer records it here and the guard
// reads it back. Deliberately separate from `withLockBypass`: this answers "who
// is writing", the bypass answers "which write is exempt".
const actorStore = new AsyncLocalStorage<{ systemAdmin: boolean }>()

/**
 * Open an actor scope for one request, defaulting to "not an admin".
 *
 * Must be called from the earliest Elysia hook, before anything is awaited:
 * `enterWith` only propagates *forward* from the async resource that calls it,
 * so a request that never opens a scope sees no actor and fails closed, and a
 * request cannot inherit the previous one's actor either.
 *
 * The store holds a mutable object on purpose. `requireAuth` only learns the
 * role after a DB round trip, and an `enterWith` issued after an `await` is
 * invisible to the caller that is awaiting it — the route handler would keep
 * the snapshot taken before the call and never see the admin. Handing out one
 * holder per request and mutating it in place is what makes the answer visible
 * to the handler that asked.
 */
export function beginLockActorScope(): void {
  actorStore.enterWith({ systemAdmin: false })
}

/**
 * Record whether the current request's actor is a system admin. Called by
 * `requireAuth` (session surface) and `resolveAgentAuth` (token surface).
 */
export function recordLockActor(systemAdmin: boolean): void {
  const store = actorStore.getStore()
  if (store) store.systemAdmin = systemAdmin
  else actorStore.enterWith({ systemAdmin })
}

/** Fail closed: no actor context (cron, sweep, scripts, stdio MCP) is not admin. */
export function isSystemAdminActor(): boolean {
  return actorStore.getStore()?.systemAdmin === true
}

// --- bypass -----------------------------------------------------------------

const bypassStore = new AsyncLocalStorage<true>()

/**
 * Run `fn` with the overdue-lock write guard disabled, regardless of actor.
 * Only for the sanctioned writes that a lock must not block (extend deadline,
 * disposition, decision notification, admin sync, trash retention) and for test
 * teardown. Grep this symbol to audit every exemption.
 */
export function withLockBypass<T>(fn: () => T | Promise<T>): Promise<T> {
  return bypassStore.run(true, async () => fn())
}

export function isLockBypassed(): boolean {
  return bypassStore.getStore() === true
}

// --- model map --------------------------------------------------------------

export const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
])

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert'])
const UNIQUE_TARGET_OPS = new Set(['update', 'upsert', 'delete'])
const MANY_TARGET_OPS = new Set(['updateMany', 'updateManyAndReturn', 'deleteMany'])
const PROJECT_UPDATE_OPS = new Set(['update', 'updateMany', 'updateManyAndReturn', 'upsert'])

type GuardSpec = {
  /** Foreign key column on the guarded row. */
  field: string
  /** Relation name a nested `connect` would use in create data. */
  relation: string
  /** Model holding `projectId`, when `field` is not a projectId itself. */
  parent?: 'task' | 'projectMilestone' | 'projectPhase'
  /** Which write ops to intercept. Defaults to all of them. */
  ops?: Set<string>
}

const viaProject: GuardSpec = { field: 'projectId', relation: 'project' }
const viaTask: GuardSpec = { field: 'taskId', relation: 'task', parent: 'task' }

export const GUARDED_MODELS: Record<string, GuardSpec> = {
  project: { field: 'id', relation: 'project', ops: PROJECT_UPDATE_OPS },
  task: viaProject,
  tag: viaProject,
  event: viaProject,
  projectMember: viaProject,
  projectMilestone: viaProject,
  projectPhase: viaProject,
  projectExtension: viaProject,
  taskComment: viaTask,
  taskEvidence: viaTask,
  taskChecklistItem: viaTask,
  taskStatusChange: viaTask,
  taskTag: viaTask,
  taskDependency: viaTask,
  milestoneTag: { field: 'milestoneId', relation: 'milestone', parent: 'projectMilestone' },
  phaseTag: { field: 'phaseId', relation: 'phase', parent: 'projectPhase' },
}

/** Model name as the client exposes it (`Task` → `task`). */
export function clientModelKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

export function isGuardedWrite(model: string | undefined, operation: string): boolean {
  if (!model) return false
  const spec = GUARDED_MODELS[clientModelKey(model)]
  return !!spec && (spec.ops ?? WRITE_OPS).has(operation)
}

// --- resolution -------------------------------------------------------------

type Row = Record<string, unknown>

// The extension only has the model name as a string, so delegates are reached
// dynamically. Narrowed to the two reads this file performs.
type Delegate = {
  findUnique(args: { where: unknown; select: Row }): Promise<Row | null>
  findMany(args: { where?: unknown; select: Row }): Promise<Row[]>
}

function delegate(raw: PrismaClient, model: string): Delegate {
  return (raw as unknown as Record<string, Delegate>)[model]
}

function strings(values: unknown[]): string[] {
  return values.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

/** FK values readable straight from create/upsert payloads. */
export function foreignKeysFromCreateData(spec: GuardSpec, args: unknown): string[] {
  const data = (args as { data?: unknown; create?: unknown })?.data ?? (args as { create?: unknown })?.create
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Row[]
  return strings(
    rows.map((row) => {
      const direct = row[spec.field]
      if (typeof direct === 'string') return direct
      return (row[spec.relation] as { connect?: { id?: unknown } } | undefined)?.connect?.id
    }),
  )
}

async function foreignKeysFromTargetRows(
  raw: PrismaClient,
  model: string,
  spec: GuardSpec,
  operation: string,
  args: unknown,
): Promise<string[]> {
  const where = (args as { where?: unknown })?.where
  const select: Row = { [spec.field]: true }
  const d = delegate(raw, model)
  // `update`/`delete`/`upsert` take a unique where, which findUnique accepts
  // verbatim (extendedWhereUnique). The *Many ops take an arbitrary filter —
  // a bare `deleteMany()` with no where resolves to every row, so a wipe that
  // touches one locked project is refused whole.
  const rows =
    UNIQUE_TARGET_OPS.has(operation) && where
      ? [await d.findUnique({ where, select })]
      : await d.findMany({ where, select })
  return strings(rows.map((row) => row?.[spec.field]))
}

export type LockableRow = {
  id: string
  name: string
  endsAt: Date | null
  status: string
  archivedAt: Date | null
}

export const LOCK_PROJECT_SELECT = {
  id: true,
  name: true,
  endsAt: true,
  status: true,
  archivedAt: true,
} as const

/**
 * First locked project among `projectIds`, or null. Shared by the extension and
 * the `project_lock_write_guard` MCP tool so the two can never disagree.
 */
export async function findLockedProject(
  lookup: (ids: string[]) => Promise<LockableRow[]>,
  projectIds: string[],
): Promise<Omit<LockedWriteContext, 'model' | 'operation'> | null> {
  if (projectIds.length === 0) return null
  // Lazy import: this module is loaded from db.ts, and project-lock →
  // app-settings → db.ts would close the cycle at module-eval time.
  const { computeLockState, getLockGraceDays } = await import('./project-lock')
  const graceDays = await getLockGraceDays()
  const projects = await lookup(projectIds)
  for (const project of projects) {
    const lock = computeLockState(project, graceDays)
    if (lock.locked) {
      return {
        projectId: project.id,
        projectName: project.name,
        stage: lock.stage,
        overdueDays: lock.overdueDays,
      }
    }
  }
  return null
}

async function assertWritable(
  raw: PrismaClient,
  model: string,
  spec: GuardSpec,
  operation: string,
  args: unknown,
): Promise<void> {
  const foreignKeys = new Set<string>()
  if (CREATE_OPS.has(operation)) {
    for (const id of foreignKeysFromCreateData(spec, args)) foreignKeys.add(id)
  }
  if (UNIQUE_TARGET_OPS.has(operation) || MANY_TARGET_OPS.has(operation)) {
    for (const id of await foreignKeysFromTargetRows(raw, model, spec, operation, args)) {
      foreignKeys.add(id)
    }
  }
  if (foreignKeys.size === 0) return // nothing resolvable (e.g. no row matched)

  let projectIds = [...foreignKeys]
  if (spec.parent) {
    const parents = await delegate(raw, spec.parent).findMany({
      where: { id: { in: projectIds } },
      select: { projectId: true },
    })
    projectIds = strings(parents.map((row) => row.projectId))
  }

  const locked = await findLockedProject(
    (ids) => raw.project.findMany({ where: { id: { in: ids } }, select: LOCK_PROJECT_SELECT }),
    projectIds,
  )
  if (locked) throw new ProjectLockedError({ ...locked, model, operation })
}

// --- extension --------------------------------------------------------------

/**
 * Compose AFTER `withSoftDelete`, passing the unextended client as `raw`:
 *
 *   const base = new PrismaClient()
 *   export const prisma = withProjectLock(withSoftDelete(base), base)
 *
 * `raw` must carry no extensions, for two reasons: the guard's own lookups must
 * not re-enter the guard (infinite recursion), and they must see trashed tasks
 * — otherwise restoring or purging a task in a locked project would resolve to
 * no row and sail through.
 */
export function withProjectLock(client: ReturnType<typeof withSoftDelete>, raw: PrismaClient) {
  return client.$extends({
    name: 'project-overdue-lock',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isLockBypassed() && !isSystemAdminActor() && isGuardedWrite(model, operation)) {
            const key = clientModelKey(model)
            // ponytail: one resolve query + one project query per guarded
            // write, no cache. Writes are not the hot path and grace days are
            // already cached for 60s; add a short-TTL project cache keyed by id
            // if write latency ever shows up in a profile.
            await assertWritable(raw, key, GUARDED_MODELS[key] as GuardSpec, operation, args)
          }
          return query(args)
        },
      },
    },
  })
}
