import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// POST /api/tasks/reorder — Kanban drag-and-drop. A pure kanbanOrder update
// (no `status` in the payload) must never touch closedAt/TaskStatusChange/
// notifications. An update that DOES carry a status change must apply the
// same closedAt set-on-CLOSED/clear-on-REOPENED logic, write a
// TaskStatusChange row, and notify the assignee — matching every other
// status-changing surface (PATCH /api/tasks/:id, agent REST, MCP tools).
// Regression: the reorder endpoint used to set `status` directly with none
// of these side effects, so a task closed via Kanban drag never got a
// closedAt and silently never appeared in the Throughput chart's "Closed"
// series or in effort/actualHours calculations.
const app = createTestApp()

let ownerId = ''
let ownerToken = ''
let assigneeId = ''
let projectId = ''

async function reorder(updates: Array<{ id: string; kanbanOrder: number; status?: string }>, token = ownerToken) {
  return app.handle(
    new Request('http://localhost/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ updates }),
    }),
  )
}

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const owner = await seedTestUser('reorder-owner@example.com', 'x', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const assignee = await seedTestUser('reorder-assignee@example.com', 'x', 'Assignee', 'USER')
  assigneeId = assignee.id

  const project = await prisma.project.create({
    data: {
      name: 'Reorder Project',
      description: 'd',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: ownerId, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId, userId: assigneeId, role: 'MEMBER' } })
})

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { projectId } })
  await prisma.taskStatusChange.deleteMany({ where: { task: { projectId } } })
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

describe('POST /api/tasks/reorder', () => {
  test('pure reorder (no status) leaves closedAt untouched and writes no TaskStatusChange', async () => {
    const t1 = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'A', description: 'd', status: 'OPEN', kanbanOrder: 0 },
    })
    const t2 = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'B', description: 'd', status: 'OPEN', kanbanOrder: 1 },
    })

    const res = await reorder([
      { id: t1.id, kanbanOrder: 1 },
      { id: t2.id, kanbanOrder: 0 },
    ])
    expect(res.status).toBe(200)

    const [after1, after2] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: t1.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: t2.id } }),
    ])
    expect(after1.kanbanOrder).toBe(1)
    expect(after1.status).toBe('OPEN')
    expect(after1.closedAt).toBeNull()
    expect(after2.kanbanOrder).toBe(0)

    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: { in: [t1.id, t2.id] } } })
    expect(changes).toHaveLength(0)
  })

  test('drag to CLOSED sets closedAt, writes TaskStatusChange, notifies assignee', async () => {
    const task = await prisma.task.create({
      data: {
        projectId,
        reporterId: ownerId,
        assigneeId,
        title: 'Close me',
        description: 'd',
        status: 'OPEN',
        kanbanOrder: 0,
      },
    })

    const res = await reorder([{ id: task.id, kanbanOrder: 0, status: 'CLOSED' }])
    expect(res.status).toBe(200)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.status).toBe('CLOSED')
    expect(after.closedAt).not.toBeNull()

    const change = await prisma.taskStatusChange.findFirst({ where: { taskId: task.id } })
    expect(change?.fromStatus).toBe('OPEN')
    expect(change?.toStatus).toBe('CLOSED')

    const notif = await prisma.notification.findFirst({
      where: { taskId: task.id, recipientId: assigneeId, kind: 'TASK_STATUS_CHANGED' },
    })
    expect(notif).not.toBeNull()
  })

  test('drag out of CLOSED (reopen) clears closedAt', async () => {
    const task = await prisma.task.create({
      data: {
        projectId,
        reporterId: ownerId,
        title: 'Reopen me',
        description: 'd',
        status: 'CLOSED',
        closedAt: new Date(),
        kanbanOrder: 0,
      },
    })

    const res = await reorder([{ id: task.id, kanbanOrder: 0, status: 'REOPENED' }])
    expect(res.status).toBe(200)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.status).toBe('REOPENED')
    expect(after.closedAt).toBeNull()
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: 'x', kanbanOrder: 0 }] }),
      }),
    )
    expect(res.status).toBe(401)
  })

  test('empty updates array → 400', async () => {
    const res = await reorder([])
    expect(res.status).toBe(400)
  })
})
