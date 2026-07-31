import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks?sort=&dir= applies ordering SERVER-SIDE so it holds across
// paginated pages, not just the current page's rows. Before this, sort was
// client-side over the 25-row page → a CRITICAL task on page 2 never surfaced.
const app = createTestApp()

let adminToken = ''
let projectId = ''
const PRIO_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('sort-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: { name: 'Sort test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  // Seed 30 tasks (> PAGE_SIZE 25) with varied priority, dueAt (incl. nulls),
  // title, and estimateHours so cross-page ordering is observable.
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
  const base = Date.now()
  const rows = Array.from({ length: 30 }, (_, i) => ({
    projectId,
    reporterId: admin.id,
    kind: 'TASK' as const,
    status: 'OPEN' as const,
    title: `Task ${String(i).padStart(2, '0')}`,
    description: 'd',
    priority: priorities[i % 4],
    // every 5th task has no due date / no estimate to exercise NULLS LAST
    dueAt: i % 5 === 0 ? null : new Date(base + i * 86_400_000),
    estimateHours: i % 5 === 0 ? null : (i % 10) + 0.5,
  }))
  await prisma.task.createMany({ data: rows })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function list(qs: string) {
  return app
    .handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&${qs}`, {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    .then((r) => r.json() as Promise<{ tasks: Array<Record<string, unknown>>; total: number }>)
}

describe('GET /api/tasks — server-side sort', () => {
  test('sort=priority&dir=desc puts CRITICAL first', async () => {
    const { tasks } = await list('sort=priority&dir=desc&limit=200')
    expect(tasks[0].priority).toBe('CRITICAL')
    // globally non-increasing by priority rank
    for (let i = 1; i < tasks.length; i++) {
      expect(PRIO_RANK[tasks[i].priority as string]).toBeLessThanOrEqual(
        PRIO_RANK[tasks[i - 1].priority as string],
      )
    }
  })

  test('priority order holds ACROSS pages (page 2 top <= page 1 bottom)', async () => {
    const p1 = await list('sort=priority&dir=desc&limit=25&offset=0')
    const p2 = await list('sort=priority&dir=desc&limit=25&offset=25')
    expect(p1.tasks).toHaveLength(25)
    expect(p2.tasks.length).toBeGreaterThan(0)
    const lastOfPage1 = PRIO_RANK[p1.tasks[24].priority as string]
    const firstOfPage2 = PRIO_RANK[p2.tasks[0].priority as string]
    expect(firstOfPage2).toBeLessThanOrEqual(lastOfPage1)
  })

  test('sort=title&dir=asc is alphabetical', async () => {
    const { tasks } = await list('sort=title&dir=asc&limit=200')
    const titles = tasks.map((t) => t.title as string)
    const sorted = [...titles].sort()
    expect(titles).toEqual(sorted)
  })

  test('sort=dueAt&dir=asc puts NULL due dates last', async () => {
    const { tasks } = await list('sort=dueAt&dir=asc&limit=200')
    const firstNull = tasks.findIndex((t) => t.dueAt == null)
    if (firstNull === -1) return // no nulls seeded (shouldn't happen)
    // once a null appears, every subsequent row must also be null
    for (let i = firstNull; i < tasks.length; i++) expect(tasks[i].dueAt).toBeNull()
  })

  test('no sort param preserves default status-asc order (OPEN before CLOSED)', async () => {
    // add one CLOSED task to prove default ordering is untouched
    await prisma.task.create({
      data: {
        projectId,
        reporterId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).ownerId,
        kind: 'TASK',
        status: 'CLOSED',
        title: 'zzz closed',
        description: 'd',
        priority: 'LOW',
      },
    })
    const { tasks } = await list('limit=200')
    const closedIdx = tasks.findIndex((t) => t.status === 'CLOSED')
    const lastOpenIdx = tasks.map((t) => t.status).lastIndexOf('OPEN')
    expect(closedIdx).toBeGreaterThan(lastOpenIdx)
  })

  test('invalid sort field → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&sort=bogus`, {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(400)
  })

  test('invalid dir → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&sort=title&dir=sideways`, {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(400)
  })
})
