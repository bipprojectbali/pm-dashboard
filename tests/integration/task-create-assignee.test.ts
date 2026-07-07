import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// The Create Task modal now sends assigneeId. Backend POST /api/tasks already
// accepts it and notifies the assignee — these tests lock that contract so the
// new UI field can't silently become a no-op.
const app = createTestApp()

let ownerId: string
let assigneeId: string
let ownerToken: string
let projectId: string

const createTask = (token: string, body: Record<string, unknown>) =>
  app.handle(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )

// notifyTaskAssigned is fire-and-forget in the route (.catch(() => {})), so the
// notification row lands shortly AFTER the response. Poll instead of asserting
// synchronously to avoid a race.
async function waitForNotification(where: { recipientId: string; taskId: string }, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const n = await prisma.notification.findFirst({ where: { ...where, kind: 'TASK_ASSIGNED' } })
    if (n) return n
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('create-assignee-owner@test.com', 'pass', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const assignee = await seedTestUser('create-assignee-dev@test.com', 'pass', 'Dev', 'USER')
  assigneeId = assignee.id
  const project = await prisma.project.create({
    data: {
      name: 'Create Assignee Project',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      members: {
        create: [
          { userId: ownerId, role: 'OWNER' },
          { userId: assigneeId, role: 'MEMBER' },
        ],
      },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/tasks — assign on create', () => {
  it('persists assigneeId and notifies the assignee', async () => {
    const res = await createTask(ownerToken, {
      projectId,
      title: 'Assigned on create',
      description: 'd',
      assigneeId,
    })
    expect(res.status).toBe(200)
    const { task } = await res.json()
    expect(task.assigneeId).toBe(assigneeId)

    const notif = await waitForNotification({ recipientId: assigneeId, taskId: task.id })
    expect(notif).not.toBeNull()
  })

  it('creates an unassigned task when assigneeId is omitted', async () => {
    const res = await createTask(ownerToken, {
      projectId,
      title: 'No assignee',
      description: 'd',
    })
    expect(res.status).toBe(200)
    expect((await res.json()).task.assigneeId).toBeNull()
  })

  it('does not notify when the creator assigns the task to themselves', async () => {
    const res = await createTask(ownerToken, {
      projectId,
      title: 'Self assigned',
      description: 'd',
      assigneeId: ownerId,
    })
    expect(res.status).toBe(200)
    const { task } = await res.json()
    const notif = await prisma.notification.findFirst({
      where: { recipientId: ownerId, taskId: task.id, kind: 'TASK_ASSIGNED' },
    })
    expect(notif).toBeNull()
  })
})
