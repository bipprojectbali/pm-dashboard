import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks?openOnly=1 must count every non-CLOSED status (OPEN,
// IN_PROGRESS, READY_FOR_QC, REOPENED), not just OPEN. The /pm Ringkasan
// "Task Terbuka" / "Bug Terbuka" cards read `total` from this and previously
// under-counted because they used ?status=OPEN.
const app = createTestApp()

let adminToken = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('openonly-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: { name: 'Open only test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })

  const mk = (
    title: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
    kind: 'TASK' | 'BUG' = 'TASK',
  ) =>
    prisma.task.create({
      data: { projectId, kind, title, description: 'd', status, priority: 'LOW', reporterId: admin.id },
    })

  // 4 non-closed statuses (2 of them BUG) + 2 CLOSED (1 of them BUG).
  await mk('open task', 'OPEN')
  await mk('in-progress task', 'IN_PROGRESS')
  await mk('ready task', 'READY_FOR_QC')
  await mk('reopened bug', 'REOPENED', 'BUG')
  await mk('open bug', 'OPEN', 'BUG')
  await mk('closed task', 'CLOSED')
  await mk('closed bug', 'CLOSED', 'BUG')
  // open non-CLOSED = 5 (3 TASK + 2 BUG); open BUG = 2; status=OPEN alone = 2
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function list(qs: string) {
  return app
    .handle(new Request(`http://localhost/api/tasks?projectId=${projectId}&${qs}`, { headers: { cookie: `session=${adminToken}` } }))
    .then((r) => r.json() as Promise<{ tasks: Array<{ status: string; kind: string }>; total: number }>)
}

describe('GET /api/tasks?openOnly=1', () => {
  test('counts all non-CLOSED statuses, not just OPEN', async () => {
    const open = await list('openOnly=1&limit=1')
    const onlyOpenStatus = await list('status=OPEN&limit=1')
    expect(open.total).toBe(5) // OPEN + IN_PROGRESS + READY_FOR_QC + REOPENED
    expect(onlyOpenStatus.total).toBe(2) // the old, under-counting behaviour
    expect(open.total).toBeGreaterThan(onlyOpenStatus.total)
  })

  test('never includes CLOSED rows', async () => {
    const open = await list('openOnly=1&limit=200')
    expect(open.tasks.some((t) => t.status === 'CLOSED')).toBe(false)
  })

  test('combines with kind=BUG for the Bug Terbuka count', async () => {
    const openBugs = await list('openOnly=1&kind=BUG&limit=1')
    expect(openBugs.total).toBe(2) // reopened bug + open bug (closed bug excluded)
  })

  test('an explicit status= still wins over openOnly', async () => {
    const closed = await list('openOnly=1&status=CLOSED&limit=200')
    expect(closed.tasks.every((t) => t.status === 'CLOSED')).toBe(true)
  })
})
