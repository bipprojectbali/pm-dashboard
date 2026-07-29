import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// The Analytics panel's stat cards (Task Terbuka, Ditutup) are derived on the
// client straight from this aggregate's `tasksByStatus` / `taskTrend`, on the
// promise that the server already excludes IDEA (backlog captures, not committed
// work) via WORKLOAD_KIND_FILTER. If that filter ever regresses, the cards would
// silently start counting ideas — this test fails first.
const app = createTestApp()

let adminToken = ''
let projectId = ''
let adminId = ''

beforeAll(async () => {
  await cleanupTestData()

  const admin = await seedTestUser('analytics-idea-admin@example.com', 'x', 'A', 'ADMIN')
  adminId = admin.id
  adminToken = await createTestSession(admin.id)

  const project = await prisma.project.create({
    data: { name: 'Analytics IDEA test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const now = new Date()
  // 2 real OPEN tasks + 3 IDEA (also "open" in their OPEN↔CLOSED lifecycle).
  await prisma.task.create({
    data: { projectId, kind: 'TASK', title: 'real 1', description: 'd', status: 'OPEN', priority: 'LOW', reporterId: admin.id, createdAt: now },
  })
  await prisma.task.create({
    data: { projectId, kind: 'BUG', title: 'real 2', description: 'd', status: 'IN_PROGRESS', priority: 'LOW', reporterId: admin.id, createdAt: now },
  })
  for (let i = 0; i < 3; i++) {
    await prisma.task.create({
      data: { projectId, kind: 'IDEA', title: `idea ${i}`, description: 'd', status: 'OPEN', priority: 'LOW', reporterId: admin.id, createdAt: now },
    })
  }
  // 1 real CLOSED today + 1 IDEA CLOSED today — only the real one may appear in taskTrend.closed.
  await prisma.task.create({
    data: { projectId, kind: 'TASK', title: 'real closed', description: 'd', status: 'CLOSED', priority: 'LOW', reporterId: admin.id, createdAt: now, closedAt: now },
  })
  await prisma.task.create({
    data: { projectId, kind: 'IDEA', title: 'idea closed', description: 'd', status: 'CLOSED', priority: 'LOW', reporterId: admin.id, createdAt: now, closedAt: now },
  })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await cleanupTestData()
  await prisma.$disconnect()
})

function get(pathname: string, token?: string) {
  return app.handle(
    new Request(`http://localhost${pathname}`, { headers: token ? { cookie: `session=${token}` } : {} }),
  )
}

describe('GET /api/admin/overview/analytics — IDEA exclusion (Analytics stat cards depend on it)', () => {
  test('tasksByStatus excludes IDEA', async () => {
    const res = await get('/api/admin/overview/analytics?trendDays=14', adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    // 2 open real (OPEN + IN_PROGRESS) + 1 CLOSED real. The 3 open ideas + 1 closed idea are excluded.
    const open = Object.entries(body.tasksByStatus as Record<string, number>)
      .filter(([s]) => s !== 'CLOSED')
      .reduce((sum, [, n]) => sum + n, 0)
    expect(open).toBe(2)
    expect(body.tasksByStatus.CLOSED ?? 0).toBe(1)
  })

  test('taskTrend.closed counts only non-IDEA closed tasks', async () => {
    const res = await get('/api/admin/overview/analytics?trendDays=14', adminToken)
    const body = await res.json()
    const totalClosed = (body.taskTrend as Array<{ closed: number }>).reduce((sum, d) => sum + d.closed, 0)
    // Only the real CLOSED task counts, not the IDEA one closed the same day.
    expect(totalClosed).toBe(1)
  })

  test('taskTrend.created counts only non-IDEA created tasks', async () => {
    const res = await get('/api/admin/overview/analytics?trendDays=14', adminToken)
    const body = await res.json()
    const totalCreated = (body.taskTrend as Array<{ created: number }>).reduce((sum, d) => sum + d.created, 0)
    // 3 real (2 open + 1 closed) created in-window; the 4 IDEA rows are excluded.
    expect(totalCreated).toBe(3)
  })
})
