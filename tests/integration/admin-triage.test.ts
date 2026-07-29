import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/admin/overview/triage — the stat-card aggregate behind the Admin
// Task Triage panel. Guards the accuracy fixes: counts computed in-DB (not a
// capped client fetch), IDEA excluded (WORKLOAD_KIND_FILTER), and overdue/stale
// defined the same way as computeRiskReport.
const app = createTestApp()

const DAY = 24 * 60 * 60 * 1000
let adminToken = ''
let userToken = ''
let projectId = ''

async function seedTask(over: Record<string, unknown>) {
  return prisma.task.create({
    data: {
      projectId,
      kind: 'TASK',
      title: 'T',
      description: 'd',
      status: 'OPEN',
      priority: 'MEDIUM',
      reporterId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).ownerId,
      ...over,
    },
  })
}

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('triage-admin@example.com', 'x', 'A', 'ADMIN')
  const user = await seedTestUser('triage-user@example.com', 'x', 'U', 'USER')
  adminToken = await createTestSession(admin.id)
  userToken = await createTestSession(user.id)

  const project = await prisma.project.create({
    data: { name: 'Triage test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const now = Date.now()
  const past = new Date(now - 2 * DAY)
  const old = new Date(now - 10 * DAY)

  // 1 plain open, assigned, fresh
  await seedTask({ assigneeId: admin.id, status: 'IN_PROGRESS', updatedAt: new Date() })
  // 1 overdue (dueAt past) + unassigned
  await seedTask({ dueAt: past, assigneeId: null })
  // 1 stale (updatedAt 10d ago) — open, so counts as stale
  await seedTask({ updatedAt: old, assigneeId: admin.id })
  // 1 blocked: create a blocker + dependency
  const blocker = await seedTask({ assigneeId: admin.id })
  const blocked = await seedTask({ assigneeId: admin.id })
  await prisma.taskDependency.create({ data: { taskId: blocked.id, blockedById: blocker.id } })
  // 1 CLOSED — excluded from every count
  await seedTask({ status: 'CLOSED', closedAt: new Date() })
  // 1 IDEA that is overdue + unassigned — must NOT be counted anywhere
  await seedTask({ kind: 'IDEA', dueAt: past, assigneeId: null })
})

afterAll(async () => {
  await prisma.taskDependency.deleteMany({ where: { task: { projectId } } })
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

async function triage(token: string, qs = '') {
  const res = await app.handle(
    new Request(`http://localhost/api/admin/overview/triage${qs}`, { headers: { cookie: `session=${token}` } }),
  )
  return { status: res.status, body: res.status === 200 ? await res.json() : null }
}

describe('GET /api/admin/overview/triage', () => {
  test('requires admin (USER → 403, anon → 401)', async () => {
    expect((await triage(userToken)).status).toBe(403)
    const anon = await app.handle(new Request('http://localhost/api/admin/overview/triage'))
    expect(anon.status).toBe(401)
  })

  test('counts open/overdue/unassigned/blocked/stale, excluding CLOSED', async () => {
    const { status, body } = await triage(adminToken)
    expect(status).toBe(200)
    // open (non-CLOSED, non-IDEA): fresh, overdue, stale, blocker, blocked = 5
    expect(body.total).toBe(5)
    expect(body.overdue).toBe(1)
    expect(body.unassigned).toBe(1)
    expect(body.blocked).toBe(1)
    expect(body.stale).toBe(1)
    expect(body.staleDays).toBe(7)
  })

  test('IDEA is excluded from every count', async () => {
    // The IDEA task is overdue + unassigned; if it leaked, overdue/unassigned
    // would be 2 and total 6. The assertions above (1/1/5) already prove it,
    // but assert the direct DB truth too.
    const openIdeas = await prisma.task.count({
      where: { projectId, kind: 'IDEA', status: { notIn: ['CLOSED'] } },
    })
    expect(openIdeas).toBe(1)
    const { body } = await triage(adminToken)
    expect(body.total).toBe(5) // not 6
    expect(body.overdue).toBe(1) // not 2
    expect(body.unassigned).toBe(1) // not 2
  })

  test('staleDays query param is honoured (clamped 1..30)', async () => {
    // With a 30-day window nothing is stale (oldest is 10d).
    const wide = await triage(adminToken, '?staleDays=30')
    expect(wide.body.stale).toBe(0)
    expect(wide.body.staleDays).toBe(30)
    // With a 1-day window, the fresh IN_PROGRESS (updatedAt now) is not stale,
    // but the 2d-overdue and 10d ones are (any open task not touched in >1d).
    const narrow = await triage(adminToken, '?staleDays=1')
    expect(narrow.body.stale).toBeGreaterThanOrEqual(1)
  })

  test('projectId filter scopes counts to one project', async () => {
    const { body } = await triage(adminToken, `?projectId=${projectId}`)
    expect(body.total).toBe(5)
  })
})
