import { describe, expect, test } from 'bun:test'
import {
  computeHealth,
  computeOverdue,
  isExtended,
} from '../../src/frontend/components/projects/helpers'
import type { ProjectListItem } from '../../src/frontend/components/projects/types'

const DAY = 24 * 60 * 60 * 1000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()

// Minimal ProjectListItem factory — only the fields the helpers read matter.
function project(overrides: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: 'p1',
    name: 'P',
    description: null,
    ownerId: 'u1',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    visibility: 'INTERNAL',
    startsAt: null,
    endsAt: null,
    originalEndAt: null,
    archivedAt: null,
    githubRepo: null,
    createdAt: iso(-100),
    updatedAt: iso(-1),
    owner: { id: 'u1', name: 'Owner', email: 'o@e.com', image: null },
    members: [],
    _count: { members: 0, tasks: 0, milestones: 0, phases: 0 },
    myRole: 'OWNER',
    canWrite: true,
    joinedAt: null,
    ...overrides,
  } as ProjectListItem
}

describe('isExtended', () => {
  test('true only when endsAt is LATER than originalEndAt (pushed back)', () => {
    expect(isExtended(project({ originalEndAt: iso(5), endsAt: iso(10) }))).toBe(true)
  })
  test('false when deadline was moved EARLIER (shortened) — the bug', () => {
    expect(isExtended(project({ originalEndAt: iso(30), endsAt: iso(10) }))).toBe(false)
  })
  test('false when deadline unchanged', () => {
    expect(isExtended(project({ originalEndAt: iso(10), endsAt: iso(10) }))).toBe(false)
  })
  test('false when either date missing', () => {
    expect(isExtended(project({ originalEndAt: null, endsAt: iso(10) }))).toBe(false)
    expect(isExtended(project({ originalEndAt: iso(10), endsAt: null }))).toBe(false)
  })
})

describe('computeHealth levels (at-risk vs delayed are distinct)', () => {
  // health = taskProgress − timeProgress; delta>=-10 on-track, >=-25 at-risk, else delayed
  const withProgress = (taskClosed: number, taskTotal: number, startDaysAgo: number, endInDays: number) =>
    project({
      startsAt: iso(-startDaysAgo),
      endsAt: iso(endInDays),
      taskStats: { open: taskTotal - taskClosed, inProgress: 0, readyForQc: 0, reopened: 0, closed: taskClosed, total: taskTotal },
    })

  test('on-track when task pace keeps up with time', () => {
    // time 50% (10d of 20d), tasks 50% → delta 0 → on-track
    expect(computeHealth(withProgress(5, 10, 10, 10))?.level).toBe('on-track')
  })
  test('at-risk for a moderate slip (delta between -10 and -25)', () => {
    // time ~50% (10 of 20), tasks 30% → delta -20 → at-risk
    expect(computeHealth(withProgress(3, 10, 10, 10))?.level).toBe('at-risk')
  })
  test('delayed for a severe slip (delta < -25) — must NOT be classed at-risk', () => {
    // time 75% (30 of 40), tasks ~17% → delta -58 → delayed
    expect(computeHealth(withProgress(2, 12, 30, 10))?.level).toBe('delayed')
  })
  test('null health for DRAFT/COMPLETED/CANCELLED', () => {
    expect(computeHealth(withProgress(2, 12, 30, 10) && project({ status: 'DRAFT', startsAt: iso(-30), endsAt: iso(10), taskStats: { open: 10, inProgress: 0, readyForQc: 0, reopened: 0, closed: 2, total: 12 } }))?.level).toBeUndefined()
  })
})

describe('computeOverdue', () => {
  test('overdue when endsAt in the past and status ACTIVE', () => {
    expect(computeOverdue(project({ status: 'ACTIVE', endsAt: iso(-3) })).overdue).toBe(true)
  })
  test('not overdue for COMPLETED/CANCELLED even if past', () => {
    expect(computeOverdue(project({ status: 'COMPLETED', endsAt: iso(-3) })).overdue).toBe(false)
    expect(computeOverdue(project({ status: 'CANCELLED', endsAt: iso(-3) })).overdue).toBe(false)
  })
  test('not overdue when no endsAt', () => {
    expect(computeOverdue(project({ endsAt: null })).overdue).toBe(false)
  })
})
