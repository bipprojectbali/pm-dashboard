import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let userToken: string
let adminToken: string
let workerId: string
let noTaskUserId: string
let projectId: string

beforeAll(async () => {
  await cleanupTestData()

  const user = await seedTestUser('user-reportuser@example.com', 'x', 'U', 'USER')
  const admin = await seedTestUser('admin-reportuser@example.com', 'x', 'A', 'ADMIN')
  const worker = await seedTestUser('worker-reportuser@example.com', 'x', 'Worker', 'USER')
  const noTaskUser = await seedTestUser('notask-reportuser@example.com', 'x', 'NoTask', 'USER')
  userToken = await createTestSession(user.id)
  adminToken = await createTestSession(admin.id)
  workerId = worker.id
  noTaskUserId = noTaskUser.id

  const project = await prisma.project.create({
    data: {
      name: 'Report-user test project',
      description: 'test',
      ownerId: admin.id,
      status: 'ACTIVE',
      priority: 'HIGH',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId: project.id, userId: worker.id, role: 'MEMBER' } })

  const now = new Date()
  const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  await prisma.task.create({
    data: {
      projectId: project.id,
      kind: 'TASK',
      title: 'Overdue report-user task',
      description: 'd',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      reporterId: admin.id,
      assigneeId: worker.id,
      dueAt: past,
    },
  })
  await prisma.task.create({
    data: {
      projectId: project.id,
      kind: 'TASK',
      title: 'Closed report-user task',
      description: 'd',
      status: 'CLOSED',
      priority: 'MEDIUM',
      reporterId: admin.id,
      assigneeId: worker.id,
      estimateHours: 4,
      startsAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      closedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
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
    new Request(`http://localhost${pathname}`, {
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  )
}

describe('GET /api/admin/report/user', () => {
  test('401 without cookie', async () => {
    const res = await get(`/api/admin/report/user?userId=${workerId}`)
    expect(res.status).toBe(401)
  })

  test('403 for USER', async () => {
    const res = await get(`/api/admin/report/user?userId=${workerId}`, userToken)
    expect(res.status).toBe(403)
  })

  test('400 when userId missing', async () => {
    const res = await get('/api/admin/report/user', adminToken)
    expect(res.status).toBe(400)
  })

  test('400 on invalid since/until', async () => {
    const res = await get(`/api/admin/report/user?userId=${workerId}&since=not-a-date`, adminToken)
    expect(res.status).toBe(400)
  })

  test('404 for unknown userId', async () => {
    const res = await get('/api/admin/report/user?userId=00000000-0000-0000-0000-000000000000', adminToken)
    expect(res.status).toBe(404)
  })

  test('returns full per-user report for the worker', async () => {
    const now = new Date()
    const since = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const until = now.toISOString()
    const res = await get(`/api/admin/report/user?userId=${workerId}&since=${since}&until=${until}`, adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.user.id).toBe(workerId)
    expect(body.user.email).toBe('worker-reportuser@example.com')
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(body.overdue).toBeGreaterThanOrEqual(1)
    expect(body.closed).toBeGreaterThanOrEqual(1)
    expect(body.byStatus).toBeDefined()
    expect(body.byPriority).toBeDefined()
    expect(body.effort).toBeDefined()
    expect(body.effort.actualHours).toBeGreaterThan(0)
    expect(Array.isArray(body.overdueTasks)).toBe(true)
    expect(body.overdueTasks.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(body.taskTrend)).toBe(true)
    expect(body.taskSnapshot).toBeDefined()
    expect(body.taskSnapshot.closedInPeriod).toBeGreaterThanOrEqual(1)
    expect(body.github).toBeDefined()
    expect(Array.isArray(body.github.byProject)).toBe(true)
    expect(Array.isArray(body.audit)).toBe(true)
    expect(body.window.since).toBeDefined()
    expect(body.window.until).toBeDefined()
    expect(body.generatedBy.email).toBe('admin-reportuser@example.com')
  })

  test('returns zeroed report for a user with no tasks', async () => {
    const res = await get(`/api/admin/report/user?userId=${noTaskUserId}`, adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.open).toBe(0)
    expect(body.closed).toBe(0)
    expect(body.overdue).toBe(0)
    expect(body.overdueTasks.length).toBe(0)
    expect(body.taskSnapshot.closedInPeriod).toBe(0)
    expect(body.taskSnapshot.createdInPeriod).toBe(0)
  })
})
