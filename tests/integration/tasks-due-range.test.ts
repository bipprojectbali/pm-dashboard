import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks due-date filters (dueFrom/dueTo/overdueOnly/noDue) are applied
// server-side and COMPOSE into one condition, so a range + overdue combine
// correctly and stay accurate across paginated pages.
const app = createTestApp()

let adminToken = ''
let projectId = ''

const DAY = 86_400_000
const now = Date.now()

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('duerange-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: { name: 'Due range test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const mk = (title: string, dueAt: Date | null, status: 'OPEN' | 'CLOSED' = 'OPEN') =>
    prisma.task.create({
      data: { projectId, reporterId: admin.id, kind: 'TASK', status, title, description: 'd', priority: 'LOW', dueAt },
    })

  await mk('past-10d', new Date(now - 10 * DAY)) // overdue
  await mk('past-3d', new Date(now - 3 * DAY)) // overdue, inside a recent range
  await mk('future-3d', new Date(now + 3 * DAY))
  await mk('future-10d', new Date(now + 10 * DAY))
  await mk('no-due', null)
  await mk('closed-past', new Date(now - 5 * DAY), 'CLOSED') // overdue by date but CLOSED
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
    .then((r) => r.json() as Promise<{ tasks: Array<{ title: string; dueAt: string | null; status: string }>; total: number }>)
}

describe('GET /api/tasks — due-date range', () => {
  test('dueFrom..dueTo returns only tasks whose dueAt is in range', async () => {
    const from = new Date(now - 5 * DAY).toISOString()
    const to = new Date(now + 5 * DAY).toISOString()
    const { tasks } = await list(`dueFrom=${from}&dueTo=${to}&limit=200`)
    const titles = tasks.map((t) => t.title).sort()
    // past-3d and future-3d are within ±5d; past-10d, future-10d, no-due are out
    expect(titles).toContain('past-3d')
    expect(titles).toContain('future-3d')
    expect(titles).not.toContain('past-10d')
    expect(titles).not.toContain('future-10d')
    expect(titles).not.toContain('no-due')
  })

  test('overdueOnly combines with dueFrom (overdue AND >= from)', async () => {
    const from = new Date(now - 5 * DAY).toISOString()
    const { tasks } = await list(`overdueOnly=1&dueFrom=${from}&limit=200`)
    const titles = tasks.map((t) => t.title)
    // past-3d is overdue AND within the last 5d; past-10d is overdue but before `from`
    expect(titles).toContain('past-3d')
    expect(titles).not.toContain('past-10d')
    // future + closed excluded
    expect(titles).not.toContain('future-3d')
    expect(titles).not.toContain('closed-past')
  })

  test('overdueOnly excludes CLOSED tasks even if past due', async () => {
    const { tasks } = await list('overdueOnly=1&limit=200')
    expect(tasks.every((t) => t.status !== 'CLOSED')).toBe(true)
    expect(tasks.map((t) => t.title)).not.toContain('closed-past')
  })

  test('noDue=1 returns only tasks with no due date', async () => {
    const { tasks } = await list('noDue=1&limit=200')
    expect(tasks.every((t) => t.dueAt === null)).toBe(true)
    expect(tasks.map((t) => t.title)).toContain('no-due')
  })
})
