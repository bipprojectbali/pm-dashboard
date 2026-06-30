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

const listTasks = (token: string, qs: string) =>
  app.handle(new Request(`http://localhost/api/tasks?${qs}`, { headers: { Cookie: `session=${token}` } }))

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('kind-owner@test.com', 'pass', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const project = await prisma.project.create({
    data: {
      name: 'Kind Test Project',
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

describe('TaskKind: TICKET + IDEA', () => {
  it('creates a TICKET and an IDEA', async () => {
    const t = await createTask(ownerToken, { projectId, title: 'A ticket', description: 'd', kind: 'TICKET' })
    expect(t.status).toBe(200)
    expect((await t.json()).task.kind).toBe('TICKET')

    const i = await createTask(ownerToken, { projectId, title: 'An idea', description: 'd', kind: 'IDEA' })
    expect(i.status).toBe(200)
    expect((await i.json()).task.kind).toBe('IDEA')
  })

  it('rejects an unknown kind with 400', async () => {
    const res = await createTask(ownerToken, { projectId, title: 'bad', description: 'd', kind: 'NONSENSE' })
    expect(res.status).toBe(400)
  })

  it('allows IDEA OPEN → CLOSED but rejects OPEN → IN_PROGRESS', async () => {
    const created = await createTask(ownerToken, { projectId, title: 'Idea life', description: 'd', kind: 'IDEA' })
    const ideaId = (await created.json()).task.id

    const toInProgress = await patchTask(ownerToken, ideaId, { status: 'IN_PROGRESS' })
    expect(toInProgress.status).toBe(400)

    const toClosed = await patchTask(ownerToken, ideaId, { status: 'CLOSED' })
    expect(toClosed.status).toBe(200)
    expect((await toClosed.json()).task.status).toBe('CLOSED')
  })

  it('promotes IDEA → TASK and records the change in the audit log', async () => {
    const created = await createTask(ownerToken, { projectId, title: 'Promote me', description: 'd', kind: 'IDEA' })
    const ideaId = (await created.json()).task.id

    const promoted = await patchTask(ownerToken, ideaId, { kind: 'TASK' })
    expect(promoted.status).toBe(200)
    expect((await promoted.json()).task.kind).toBe('TASK')

    const audit = await prisma.auditLog.findFirst({
      where: { userId: ownerId, action: 'TASK_UPDATED', detail: { contains: `#${ideaId}` } },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.detail).toContain('kind:IDEA→TASK')
  })

  it('filters by kind=TICKET (excludes other kinds)', async () => {
    const res = await listTasks(ownerToken, 'kind=TICKET&limit=200')
    expect(res.status).toBe(200)
    const { tasks } = await res.json()
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks.every((t: { kind: string }) => t.kind === 'TICKET')).toBe(true)
  })
})

describe('IDEA excluded from workload metrics', () => {
  it('does not count an overdue IDEA in risk report', async () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    // An overdue IDEA must NOT appear as an overdue risk; an overdue TASK must.
    const idea = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'Overdue idea', description: '', kind: 'IDEA', status: 'OPEN', priority: 'HIGH', dueAt: past },
    })
    const task = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'Overdue task', description: '', kind: 'TASK', status: 'OPEN', priority: 'HIGH', dueAt: past },
    })

    const res = await app.handle(
      new Request('http://localhost/api/admin/overview/risks', { headers: { Cookie: `session=${ownerToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const overdueTitles = (body.overdueTasks ?? []).map((t: { title: string }) => t.title)
    expect(overdueTitles).toContain('Overdue task')
    expect(overdueTitles).not.toContain('Overdue idea')

    await prisma.task.deleteMany({ where: { id: { in: [idea.id, task.id] } } })
  })
})
