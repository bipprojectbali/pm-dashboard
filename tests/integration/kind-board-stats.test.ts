import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks/kind-board-stats — visibility-scoped, kind-scoped stat counts
// for the Tiket/Pengembangan boards. Also covers the opt-in ?staleDays= filter
// on GET /api/tasks that the board's "Stale" quick-filter relies on.
const app = createTestApp()

let adminToken = ''
let projectId = ''
const DAY = 86_400_000

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('kbstats-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const member = await seedTestUser('kbstats-member@example.com', 'x', 'M', 'USER')
  // PRIVATE so the visibility test is meaningful — an INTERNAL/PUBLIC project is
  // visible to every logged-in user by design.
  const project = await prisma.project.create({
    data: {
      name: 'KB stats',
      description: 'd',
      ownerId: admin.id,
      status: 'ACTIVE',
      priority: 'HIGH',
      visibility: 'PRIVATE',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const now = Date.now()
  const mk = (
    kind: 'TICKET' | 'IDEA' | 'TASK',
    over: Partial<{ status: 'OPEN' | 'CLOSED'; dueAt: Date | null; assigneeId: string | null; updatedAt: Date }> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        reporterId: admin.id,
        kind,
        title: `${kind}-${Math.random()}`,
        description: 'd',
        status: over.status ?? 'OPEN',
        priority: 'MEDIUM',
        dueAt: over.dueAt ?? null,
        assigneeId: over.assigneeId ?? null,
        ...(over.updatedAt ? { updatedAt: over.updatedAt } : {}),
      },
    })

  // TICKET: 4 open (1 overdue, all unassigned, 1 stale) + 1 closed
  await mk('TICKET', { dueAt: new Date(now - 3 * DAY) }) // overdue
  await mk('TICKET')
  await mk('TICKET', { assigneeId: member.id })
  await mk('TICKET', { updatedAt: new Date(now - 10 * DAY) }) // stale
  await mk('TICKET', { status: 'CLOSED' }) // excluded
  // IDEA: 2 open
  await mk('IDEA')
  await mk('IDEA')
  // TASK: must NOT count on either board
  await mk('TASK')
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function stats(qs: string, token = adminToken) {
  return app.handle(
    new Request(`http://localhost/api/tasks/kind-board-stats?${qs}`, { headers: { cookie: `session=${token}` } }),
  )
}

describe('GET /api/tasks/kind-board-stats', () => {
  test('TICKET counts: open total excludes CLOSED, overdue/unassigned/stale correct', async () => {
    const res = await stats('kind=TICKET')
    expect(res.status).toBe(200)
    const s = (await res.json()) as Record<string, number>
    expect(s.total).toBe(4) // 4 open TICKET (closed excluded)
    expect(s.overdue).toBe(1)
    expect(s.unassigned).toBe(3) // 4 open − 1 assigned
    expect(s.stale).toBe(1)
  })

  test('IDEA counts its own kind (not excluded like admin triage)', async () => {
    const res = await stats('kind=IDEA')
    const s = (await res.json()) as Record<string, number>
    expect(s.total).toBe(2)
  })

  test('does not count TASK-kind tasks on either board', async () => {
    const t = (await (await stats('kind=TICKET')).json()) as Record<string, number>
    const i = (await (await stats('kind=IDEA')).json()) as Record<string, number>
    // 4 TICKET + 2 IDEA = 6 open non-TASK; the 1 TASK is never in either total
    expect(t.total + i.total).toBe(6)
  })

  test('invalid kind → 400', async () => {
    expect((await stats('kind=BOGUS')).status).toBe(400)
    expect((await stats('')).status).toBe(400)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/tasks/kind-board-stats?kind=TICKET'))
    expect(res.status).toBe(401)
  })

  test('non-member on a private project sees zero (visibility-scoped)', async () => {
    const outsider = await seedTestUser('kbstats-outsider@example.com', 'x', 'O', 'USER')
    const outsiderToken = await createTestSession(outsider.id)
    const s = (await (await stats('kind=TICKET', outsiderToken)).json()) as Record<string, number>
    expect(s.total).toBe(0)
  })
})

describe('GET /api/tasks?staleDays= (opt-in)', () => {
  function list(qs: string) {
    return app
      .handle(new Request(`http://localhost/api/tasks?projectId=${projectId}&${qs}`, { headers: { cookie: `session=${adminToken}` } }))
      .then((r) => r.json() as Promise<{ tasks: Array<{ status: string }>; total: number }>)
  }

  test('staleDays=7 returns only open tasks not updated in 7d', async () => {
    const r = await list('staleDays=7&limit=200')
    // exactly the 1 stale TICKET seeded (updatedAt -10d); everything else is fresh
    expect(r.total).toBe(1)
    expect(r.tasks.every((t) => t.status !== 'CLOSED')).toBe(true)
  })

  test('absent staleDays leaves the list unaffected (regression guard)', async () => {
    const withStale = await list('staleDays=7&limit=200')
    const without = await list('limit=200')
    expect(without.total).toBeGreaterThan(withStale.total)
  })
})
