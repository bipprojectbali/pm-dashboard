import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket duplicate detection', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string

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

  const similar = (qs: string, token = qcToken) =>
    app.handle(
      new Request(`http://localhost/api/qc/tickets/similar?${qs}`, {
        headers: token ? { Cookie: `session=${token}` } : {},
      }),
    )

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-dup@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-dup@test.com', 'pass', 'Admin', 'ADMIN')
    qcToken = await createTestSession(qc.id)
    const adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Dup Test' }),
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

  it('returns a near-duplicate ticket ranked by similarity score', async () => {
    const id = await createTicket({ title: 'Login button freeze setelah 2 klik', description: 'x', priority: 'HIGH' })
    const res = await similar(`title=${encodeURIComponent('Login button frozen setelah klik')}`)
    const json = await res.json()
    expect(res.status).toBe(200)
    const hit = json.possibleDuplicates.find((d: { id: string }) => d.id === id)
    expect(hit).toBeDefined()
    expect(hit.score).toBeGreaterThan(0.3)
  })

  it('returns empty for a dissimilar title', async () => {
    const res = await similar(`title=${encodeURIComponent('Database migration error pada deploy')}`)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(json.possibleDuplicates)).toBe(true)
    expect(json.possibleDuplicates.length).toBe(0)
  })

  it('excludes CLOSED tickets from results', async () => {
    const id = await createTicket({ title: 'Export CSV gagal pada halaman report', description: 'x', priority: 'LOW' })
    await prisma.task.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } })
    const res = await similar(`title=${encodeURIComponent('Export CSV gagal pada report')}`)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.possibleDuplicates.find((d: { id: string }) => d.id === id)).toBeUndefined()
  })

  it('returns 400 when title is blank', async () => {
    const res = await similar('title=')
    expect(res.status).toBe(400)
  })

  it('returns 401 without a session', async () => {
    const res = await similar(`title=${encodeURIComponent('anything')}`, '')
    expect(res.status).toBe(401)
  })
})
