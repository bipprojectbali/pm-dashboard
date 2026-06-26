import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket pagination', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string
  const TOTAL = 30

  const createTicket = (body: Record<string, unknown>) =>
    app
      .handle(
        new Request('http://localhost/api/qc/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `session=${qcToken}` },
          body: JSON.stringify(body),
        }),
      )
      .then((r) => r.json())

  const list = (qs: string) =>
    app
      .handle(new Request(`http://localhost/api/qc/tickets?${qs}`, { headers: { Cookie: `session=${qcToken}` } }))
      .then(
        (r) =>
          r.json() as Promise<{
            tickets: { id: string; title: string }[]
            total: number
            page: number
            limit: number
            totalPages: number
          }>,
      )

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-page@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-page@test.com', 'pass', 'Admin', 'ADMIN')
    qcToken = await createTestSession(qc.id)
    const adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Pagination Test' }),
      }),
    )
    selfProjectId = (await projRes.json()).project.id
    await prisma.project.update({ where: { id: selfProjectId }, data: { isSelf: true } })
    await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })

    for (let i = 0; i < TOTAL; i++) {
      await createTicket({ title: `Ticket ${String(i).padStart(2, '0')}`, description: 'x', priority: 'MEDIUM' })
    }
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('returns first page with default limit 25 and correct total', async () => {
    const res = await list('status=all')
    expect(res.total).toBe(TOTAL)
    expect(res.page).toBe(1)
    expect(res.limit).toBe(25)
    expect(res.totalPages).toBe(2)
    expect(res.tickets).toHaveLength(25)
  })

  it('returns the remainder on page 2', async () => {
    const res = await list('status=all&page=2')
    expect(res.page).toBe(2)
    expect(res.tickets).toHaveLength(TOTAL - 25)
  })

  it('respects a custom limit', async () => {
    const res = await list('status=all&limit=10&page=2')
    expect(res.limit).toBe(10)
    expect(res.totalPages).toBe(3)
    expect(res.tickets).toHaveLength(10)
  })

  it('does not overlap pages', async () => {
    const p1 = await list('status=all&limit=10&page=1')
    const p2 = await list('status=all&limit=10&page=2')
    const ids = new Set(p1.tickets.map((t) => t.id))
    expect(p2.tickets.some((t) => ids.has(t.id))).toBe(false)
  })

  it('returns empty tickets for an out-of-range page', async () => {
    const res = await list('status=all&page=99')
    expect(res.tickets).toHaveLength(0)
    expect(res.total).toBe(TOTAL)
  })

  it('clamps limit to the 100 max', async () => {
    const res = await list('status=all&limit=9999')
    expect(res.limit).toBe(100)
    expect(res.tickets).toHaveLength(TOTAL)
  })
})
