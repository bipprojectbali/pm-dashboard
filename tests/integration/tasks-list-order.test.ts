import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Locks the invariant the Admin Task Triage table depends on: GET /api/tasks
// orders by status enum-order (OPEN first … CLOSED last), so a truncating
// `limit` drops CLOSED rows before open ones. If someone reorders the
// TaskStatus enum and pushes CLOSED earlier, the triage table would start
// hiding open work under the 200-row cap — this test fails first.
const app = createTestApp()

let adminToken = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('listorder-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: { name: 'List order test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const mk = (title: string, status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') =>
    prisma.task.create({
      data: { projectId, kind: 'TASK', title, description: 'd', status, priority: 'LOW', reporterId: admin.id },
    })
  // Seed CLOSED first so creation order can't accidentally satisfy the assertion.
  await mk('closed one', 'CLOSED')
  await mk('open one', 'OPEN')
  await mk('in progress one', 'IN_PROGRESS')
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

describe('GET /api/tasks ordering', () => {
  test('open statuses precede CLOSED regardless of creation order', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}`, {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const { tasks } = (await res.json()) as { tasks: Array<{ status: string }> }
    const closedIdx = tasks.findIndex((t) => t.status === 'CLOSED')
    const lastOpenIdx = tasks.map((t) => t.status).lastIndexOf('OPEN')
    const lastInProgressIdx = tasks.map((t) => t.status).lastIndexOf('IN_PROGRESS')
    // CLOSED must come after every open row.
    expect(closedIdx).toBeGreaterThan(lastOpenIdx)
    expect(closedIdx).toBeGreaterThan(lastInProgressIdx)
  })
})
