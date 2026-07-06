import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerToken: string
let ownerId: string
let projectId: string

const createTask = (token: string, body: Record<string, unknown>) =>
  app.handle(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )

const patchTask = (token: string, id: string, body: Record<string, unknown>) =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )

/** Directly seed a task at a specific status (bypasses the state machine so we
 * can set up a READY_FOR_QC ticket without walking transitions). */
const seedTask = (kind: string, status: string) =>
  prisma.task.create({
    data: { projectId, reporterId: ownerId, title: `${kind} ${status}`, description: 'd', kind: kind as never, status: status as never, priority: 'MEDIUM' },
  })

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('kindchange-owner@test.com', 'pass', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const project = await prisma.project.create({
    data: {
      name: 'Kind Change Project',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      members: { create: { userId: ownerId, role: 'OWNER' } },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('PATCH /api/tasks/:id — kind change guard', () => {
  it('changes TASK → BUG (compatible statuses) with 200', async () => {
    const created = await createTask(ownerToken, { projectId, title: 'plain task', description: 'd', kind: 'TASK' })
    const id = (await created.json()).task.id

    const res = await patchTask(ownerToken, id, { kind: 'BUG' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.kind).toBe('BUG')
  })

  it('changes BUG → QC while IN_PROGRESS (status stays valid) with 200', async () => {
    const bug = await seedTask('BUG', 'IN_PROGRESS')
    const res = await patchTask(ownerToken, bug.id, { kind: 'QC' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.kind).toBe('QC')
    expect(body.task.status).toBe('IN_PROGRESS')
  })

  it('rejects TICKET(READY_FOR_QC) → TASK with 400 (TASK has no QC stage)', async () => {
    const ticket = await seedTask('TICKET', 'READY_FOR_QC')
    const res = await patchTask(ownerToken, ticket.id, { kind: 'TASK' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('READY_FOR_QC')
    // Kind must not have changed on a rejected request.
    const after = await prisma.task.findUnique({ where: { id: ticket.id } })
    expect(after?.kind).toBe('TICKET')
  })

  it('allows TICKET(READY_FOR_QC) → TASK when the same request also moves to a valid status', async () => {
    const ticket = await seedTask('TICKET', 'READY_FOR_QC')
    // READY_FOR_QC → CLOSED is valid for TICKET, and CLOSED is valid for TASK.
    const res = await patchTask(ownerToken, ticket.id, { kind: 'TASK', status: 'CLOSED' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.kind).toBe('TASK')
    expect(body.task.status).toBe('CLOSED')
  })

  it('rejects an unknown kind with 400', async () => {
    const created = await createTask(ownerToken, { projectId, title: 'x', description: 'd', kind: 'TASK' })
    const id = (await created.json()).task.id
    const res = await patchTask(ownerToken, id, { kind: 'NONSENSE' })
    expect(res.status).toBe(400)
  })
})
