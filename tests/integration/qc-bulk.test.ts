import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket bulk update', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string
  let assigneeId: string

  const createTicket = (body: Record<string, unknown>) =>
    app
      .handle(
        new Request('http://localhost/api/qc/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `session=${qcToken}` },
          body: JSON.stringify(body),
        }),
      )
      .then((r) => r.json().then((j) => j.ticket.id as string))

  const bulk = (body: Record<string, unknown>, token = qcToken) =>
    app.handle(
      new Request('http://localhost/api/qc/tickets/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
        body: JSON.stringify(body),
      }),
    )

  const getTicket = (id: string) =>
    prisma.task.findUnique({ where: { id }, select: { status: true, priority: true, assigneeId: true, closedAt: true } })

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-bulk@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-bulk@test.com', 'pass', 'Admin', 'ADMIN')
    const dev = await seedTestUser('dev-bulk@test.com', 'pass', 'Dev User', 'USER')
    assigneeId = dev.id
    qcToken = await createTestSession(qc.id)
    const adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Bulk Test' }),
      }),
    )
    selfProjectId = (await projRes.json()).project.id
    await prisma.project.update({ where: { id: selfProjectId }, data: { isSelf: true } })
    await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('bulk-updates status across multiple tickets and writes status changes', async () => {
    const a = await createTicket({ title: 'Bulk A', description: 'x', priority: 'LOW' })
    const b = await createTicket({ title: 'Bulk B', description: 'x', priority: 'LOW' })
    const res = await bulk({ ids: [a, b], status: 'CLOSED' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.updated).toBe(2)
    expect(json.statusChanges).toBe(2)
    const [ta, tb] = await Promise.all([getTicket(a), getTicket(b)])
    expect(ta?.status).toBe('CLOSED')
    expect(tb?.status).toBe('CLOSED')
    expect(ta?.closedAt).not.toBeNull()
    const changes = await prisma.taskStatusChange.count({ where: { taskId: { in: [a, b] }, toStatus: 'CLOSED' } })
    expect(changes).toBe(2)
  })

  it('bulk-updates priority and assignee in one call', async () => {
    const a = await createTicket({ title: 'Bulk C', description: 'x', priority: 'LOW' })
    const res = await bulk({ ids: [a], priority: 'HIGH', assigneeId })
    expect(res.status).toBe(200)
    const t = await getTicket(a)
    expect(t?.priority).toBe('HIGH')
    expect(t?.assigneeId).toBe(assigneeId)
  })

  it('clears assignee when assigneeId is null', async () => {
    const a = await createTicket({ title: 'Bulk D', description: 'x', priority: 'LOW' })
    await bulk({ ids: [a], assigneeId })
    await bulk({ ids: [a], assigneeId: null })
    const t = await getTicket(a)
    expect(t?.assigneeId).toBeNull()
  })

  it('clears closedAt when reopening a closed ticket', async () => {
    const a = await createTicket({ title: 'Bulk E', description: 'x', priority: 'LOW' })
    await bulk({ ids: [a], status: 'CLOSED' })
    await bulk({ ids: [a], status: 'REOPENED' })
    const t = await getTicket(a)
    expect(t?.status).toBe('REOPENED')
    expect(t?.closedAt).toBeNull()
  })

  it('rejects when no fields are provided', async () => {
    const a = await createTicket({ title: 'Bulk F', description: 'x', priority: 'LOW' })
    const res = await bulk({ ids: [a] })
    expect(res.status).toBe(400)
  })

  it('rejects when ids is empty', async () => {
    const res = await bulk({ ids: [], status: 'CLOSED' })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid status value', async () => {
    const a = await createTicket({ title: 'Bulk G', description: 'x', priority: 'LOW' })
    const res = await bulk({ ids: [a], status: 'NOPE' })
    expect(res.status).toBe(400)
  })

  it('ignores ticket ids outside the self-project', async () => {
    const a = await createTicket({ title: 'Bulk H', description: 'x', priority: 'LOW' })
    const res = await bulk({ ids: [a, 'non-existent-id'], status: 'CLOSED' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.updated).toBe(1)
  })

  it('returns 401 without a session', async () => {
    const a = await createTicket({ title: 'Bulk I', description: 'x', priority: 'LOW' })
    const res = await app.handle(
      new Request('http://localhost/api/qc/tickets/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [a], status: 'CLOSED' }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
