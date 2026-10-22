import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket pagination', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string
  const TOTAL = 30

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
    const aiQueueTag = await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })

    // Seed langsung lewat prisma, bukan 30 POST /api/qc/tickets: DB test remote
    // (~100ms per round trip) membuat 30 request serial menembus timeout 60s hook
    // saat batch lain membebani koneksi. Bentuk barisnya menyamai jalur create
    // (kind BUG, status OPEN default, priority MEDIUM, link tag ai-queue) supaya
    // predikat GET /api/qc/tickets tetap cocok.
    const base = Date.now() - TOTAL * 1000
    const tickets = Array.from({ length: TOTAL }, (_, i) => ({
      id: crypto.randomUUID(),
      projectId: selfProjectId,
      reporterId: qc.id,
      kind: 'BUG' as const,
      title: `Ticket ${String(i).padStart(2, '0')}`,
      description: 'x',
      priority: 'MEDIUM' as const,
      // createdAt eksplisit & berjarak: route mengurutkan priority desc lalu createdAt desc,
      // dan satu createMany memberi now() yang sama ke semua baris sehingga urutan
      // halaman jadi tidak deterministik — tes "does not overlap pages" butuh ini stabil.
      createdAt: new Date(base + i * 1000),
    }))
    await prisma.task.createMany({ data: tickets })
    await prisma.taskTag.createMany({ data: tickets.map((t) => ({ taskId: t.id, tagId: aiQueueTag.id })) })
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
