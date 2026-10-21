/**
 * Guards validateReorderTransitions (src/routes/tasks/reorder.helpers.ts), the
 * status gate on POST /api/tasks/reorder.
 *
 * The endpoint used to write whatever `status` string the Kanban client sent,
 * with no check that the transition was legal for the task's kind — so dropping
 * a card in the wrong column could skip a kind's QC gate. The gate now reuses
 * getAllowedTaskTransitions (src/lib/task-lifecycle.ts), the same state machine
 * PATCH /api/tasks/:id uses. This test fails if the reorder path ever grows its
 * own second opinion about which transitions are legal.
 */
import { describe, expect, test } from 'bun:test'
import type { Task } from '../../generated/prisma'
import { getAllowedTaskTransitions } from '../../src/lib/task-lifecycle'
import { validateReorderTransitions } from '../../src/routes/tasks/reorder.helpers'

type Kind = 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
type Status = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'

/** Minimal Task stand-in — the validator only reads id/title/status/kind. */
function task(id: string, status: Status, kind: Kind = 'TASK'): Task {
  return { id, title: `Task ${id}`, status, kind } as unknown as Task
}

function validate(rows: Array<{ id: string; status?: string }>, tasks: Task[]) {
  return validateReorderTransitions(
    rows.map((r) => ({ id: r.id, kanbanOrder: 0, status: r.status })),
    new Map(tasks.map((t) => [t.id, t])),
  )
}

describe('validateReorderTransitions', () => {
  test('legal transition is accepted and reported', () => {
    const t = task('a', 'OPEN')
    const res = validate([{ id: 'a', status: 'IN_PROGRESS' }], [t])
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.transitions).toHaveLength(1)
    expect(res.transitions[0]!.before.id).toBe('a')
    expect(res.transitions[0]!.toStatus).toBe('IN_PROGRESS')
  })

  test('QC task cannot jump OPEN → READY_FOR_QC (skipping the work stage)', () => {
    const res = validate([{ id: 'q', status: 'READY_FOR_QC' }], [task('q', 'OPEN', 'QC')])
    expect('error' in res).toBe(true)
    if (!('error' in res)) return
    // Message must name the task and the refused transition.
    expect(res.error).toContain('q')
    expect(res.error).toContain('OPEN')
    expect(res.error).toContain('READY_FOR_QC')
    expect(res.error).toContain('QC')
  })

  test('TASK kind has no QC stage, so OPEN → READY_FOR_QC is refused', () => {
    const res = validate([{ id: 'a', status: 'READY_FOR_QC' }], [task('a', 'OPEN', 'TASK')])
    expect('error' in res).toBe(true)
  })

  test('one illegal row rejects the whole batch — no partial transition list', () => {
    const rows = [
      { id: 'a', status: 'IN_PROGRESS' }, // legal
      { id: 'b', status: 'READY_FOR_QC' }, // illegal for TASK
      { id: 'c', status: 'CLOSED' }, // legal
    ]
    const res = validate(rows, [task('a', 'OPEN'), task('b', 'OPEN'), task('c', 'OPEN')])
    expect('error' in res).toBe(true)
    if (!('error' in res)) return
    expect(res.error).toContain('b')
  })

  test('pure reorder (no status) yields no transitions', () => {
    const res = validate([{ id: 'a' }, { id: 'b' }], [task('a', 'OPEN'), task('b', 'OPEN')])
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.transitions).toHaveLength(0)
  })

  test('re-sending the current status is a no-op, not an illegal transition', () => {
    // The state machine lists no OPEN → OPEN edge, but a client echoing the
    // current status is not asking for an illegal move.
    expect(getAllowedTaskTransitions('OPEN', 'TASK')).not.toContain('OPEN')
    const res = validate([{ id: 'a', status: 'OPEN' }], [task('a', 'OPEN')])
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.transitions).toHaveLength(0)
  })

  test('unknown task id is refused rather than silently skipped', () => {
    const res = validate([{ id: 'missing', status: 'CLOSED' }], [])
    expect('error' in res).toBe(true)
  })

  test('IDEA only toggles OPEN ↔ CLOSED', () => {
    expect('error' in validate([{ id: 'i', status: 'CLOSED' }], [task('i', 'OPEN', 'IDEA')])).toBe(false)
    expect('error' in validate([{ id: 'i', status: 'IN_PROGRESS' }], [task('i', 'OPEN', 'IDEA')])).toBe(true)
  })

  test('gate agrees with getAllowedTaskTransitions for every kind/status pair', () => {
    const kinds: Kind[] = ['TASK', 'BUG', 'QC', 'TICKET', 'IDEA']
    const statuses: Status[] = ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED']
    for (const kind of kinds) {
      for (const from of statuses) {
        for (const to of statuses) {
          if (from === to) continue
          const allowed = getAllowedTaskTransitions(from, kind).includes(to)
          const res = validate([{ id: 'x', status: to }], [task('x', from, kind)])
          expect('error' in res).toBe(!allowed)
        }
      }
    }
  })
})
