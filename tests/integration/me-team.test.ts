import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/me/team — teammate list + per-teammate openTasks/overdueTasks used
// by the /pm "Tim" board. IDEA-kind tasks are backlog captures, not committed
// work, so they must be excluded from the workload counts — same rule as
// WORKLOAD_KIND_FILTER everywhere else (admin overview, triage, analytics).
const app = createTestApp()

let ownerId = ''
let ownerToken = ''
let teammateId = ''
let projectId = ''
const DAY = 86_400_000

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const owner = await seedTestUser('me-team-owner@example.com', 'x', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const teammate = await seedTestUser('me-team-mate@example.com', 'x', 'Mate', 'USER')
  teammateId = teammate.id

  const project = await prisma.project.create({
    data: { name: 'Me Team Project', ownerId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE' },
  })
  projectId = project.id
  await prisma.projectMember.createMany({
    data: [
      { projectId, userId: ownerId, role: 'OWNER' },
      { projectId, userId: teammateId, role: 'MEMBER' },
    ],
  })

  const mk = (kind: 'TASK' | 'IDEA', over: Partial<{ dueAt: Date | null }> = {}) =>
    prisma.task.create({
      data: {
        projectId,
        reporterId: ownerId,
        assigneeId: teammateId,
        kind,
        title: `${kind}-${Math.random()}`,
        description: 'd',
        status: 'OPEN',
        priority: 'MEDIUM',
        dueAt: over.dueAt ?? null,
      },
    })

  // Committed work: 1 open TASK (1 overdue).
  await mk('TASK', { dueAt: new Date(Date.now() - 2 * DAY) })
  // Backlog ideas: must not inflate openTasks/overdueTasks.
  await mk('IDEA')
  await mk('IDEA', { dueAt: new Date(Date.now() - 5 * DAY) })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function getTeam(token = ownerToken) {
  return app.handle(new Request('http://localhost/api/me/team', { headers: { cookie: `session=${token}` } }))
}

describe('GET /api/me/team', () => {
  test('openTasks/overdueTasks exclude IDEA-kind tasks', async () => {
    const res = await getTeam()
    expect(res.status).toBe(200)
    const { teammates } = (await res.json()) as {
      teammates: Array<{ id: string; openTasks: number; overdueTasks: number }>
    }
    const mate = teammates.find((t) => t.id === teammateId)
    expect(mate).toBeDefined()
    // Only the 1 TASK counts — the 2 IDEA tasks (1 of them overdue) must not.
    expect(mate?.openTasks).toBe(1)
    expect(mate?.overdueTasks).toBe(1)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/me/team'))
    expect(res.status).toBe(401)
  })
})
