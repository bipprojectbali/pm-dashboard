import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// POST /api/tasks/bulk — Task-menu bulk import. Covers the widened kind support
// (now TASK|BUG|QC|TICKET|IDEA, matching the single-create form) and the
// all-or-nothing validation. This endpoint had no test before.
const app = createTestApp()

let adminToken = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const admin = await seedTestUser('bulk-admin@example.com', 'x', 'A', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: { name: 'Bulk test', description: 'd', ownerId: admin.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: admin.id, role: 'OWNER' } })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function post(body: unknown, token = adminToken) {
  return app.handle(
    new Request('http://localhost/api/tasks/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/tasks/bulk — kind support', () => {
  test('accepts all five kinds (TASK/BUG/QC/TICKET/IDEA)', async () => {
    const res = await post({
      projectId,
      tasks: [
        { title: 'a task', description: 'd', kind: 'TASK', priority: 'LOW' },
        { title: 'a bug', description: 'd', kind: 'BUG', priority: 'MEDIUM' },
        { title: 'a qc', description: 'd', kind: 'QC', priority: 'HIGH' },
        { title: 'a ticket', description: 'd', kind: 'TICKET', priority: 'HIGH' },
        { title: 'an idea', description: 'd', kind: 'IDEA', priority: 'LOW' },
      ],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; ids: string[] }
    expect(body.count).toBe(5)
    const created = await prisma.task.findMany({ where: { id: { in: body.ids } }, select: { kind: true } })
    const kinds = created.map((t) => t.kind).sort()
    expect(kinds).toEqual(['BUG', 'IDEA', 'QC', 'TASK', 'TICKET'])
  })

  test('kind defaults to TASK when omitted', async () => {
    const res = await post({ projectId, tasks: [{ title: 'no kind', description: 'd', priority: 'LOW' }] })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ids: string[] }
    const t = await prisma.task.findUniqueOrThrow({ where: { id: body.ids[0] } })
    expect(t.kind).toBe('TASK')
  })

  test('rejects an unknown kind → 400, nothing created', async () => {
    const before = await prisma.task.count({ where: { projectId } })
    const res = await post({
      projectId,
      tasks: [
        { title: 'ok', description: 'd', kind: 'TICKET', priority: 'LOW' },
        { title: 'bad', description: 'd', kind: 'BOGUS', priority: 'LOW' },
      ],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; errors?: Array<{ field: string }> }
    expect(body.error).toBe('Validation failed')
    expect(body.errors?.some((e) => e.field === 'kind')).toBe(true)
    // all-or-nothing: the valid TICKET row is NOT created either
    expect(await prisma.task.count({ where: { projectId } })).toBe(before)
  })

  test('missing projectId → 400', async () => {
    const res = await post({ tasks: [{ title: 'x', description: 'd', priority: 'LOW' }] })
    expect(res.status).toBe(400)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, tasks: [{ title: 'x', description: 'd', priority: 'LOW' }] }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
