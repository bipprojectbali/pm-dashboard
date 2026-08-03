import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks/dashboard-stats — Total/Open/Closed/Overdue counted directly in
// the DB so the numbers stay correct beyond the /api/tasks 200-row cap. Before
// this endpoint, the Tasks panel derived these cards from `tasks.length` over a
// capped fetch, silently under-counting a project past ~200 tasks.
const app = createTestApp()

let ownerId = ''
let ownerToken = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const owner = await seedTestUser('dash-stats-owner@example.com', 'x', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const project = await prisma.project.create({
    data: {
      name: 'Dashboard Stats Project',
      description: 'd',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: ownerId, role: 'OWNER' } })

  // 210 tasks total — well past the /api/tasks 200-row cap — so a client-side
  // count over a single capped fetch would under-report. 10 open (2 overdue),
  // 200 closed.
  const now = Date.now()
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => ({
      projectId,
      reporterId: ownerId,
      kind: 'TASK' as const,
      status: 'OPEN' as const,
      title: `Open ${i}`,
      description: 'd',
      priority: 'MEDIUM' as const,
      dueAt: i < 2 ? new Date(now - 2 * 86_400_000) : null, // 2 overdue
    })),
    ...Array.from({ length: 200 }, (_, i) => ({
      projectId,
      reporterId: ownerId,
      kind: 'TASK' as const,
      status: 'CLOSED' as const,
      title: `Closed ${i}`,
      description: 'd',
      priority: 'MEDIUM' as const,
    })),
  ]
  await prisma.task.createMany({ data: rows })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function stats(qs: string, token = ownerToken) {
  return app.handle(
    new Request(`http://localhost/api/tasks/dashboard-stats?${qs}`, { headers: { cookie: `session=${token}` } }),
  )
}

describe('GET /api/tasks/dashboard-stats', () => {
  test('counts all 210 tasks, not capped at 200', async () => {
    const res = await stats(`projectId=${projectId}`)
    expect(res.status).toBe(200)
    const s = (await res.json()) as { total: number; open: number; closed: number; overdue: number }
    expect(s.total).toBe(210)
    expect(s.open).toBe(10)
    expect(s.closed).toBe(200)
    expect(s.overdue).toBe(2)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tasks/dashboard-stats?projectId=${projectId}`))
    expect(res.status).toBe(401)
  })

  test('non-member on a private project → 403', async () => {
    const outsider = await seedTestUser('dash-stats-outsider@example.com', 'x', 'O', 'USER')
    const outsiderToken = await createTestSession(outsider.id)
    const res = await stats(`projectId=${projectId}`, outsiderToken)
    expect(res.status).toBe(403)
  })
})
