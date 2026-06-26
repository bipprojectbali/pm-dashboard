import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket search + sort', () => {
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
      .then((r) => r.json())

  const list = (qs: string) =>
    app
      .handle(new Request(`http://localhost/api/qc/tickets?${qs}`, { headers: { Cookie: `session=${qcToken}` } }))
      .then((r) => r.json() as Promise<{ tickets: { id: string; title: string }[] }>)

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-search@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-search@test.com', 'pass', 'Admin', 'ADMIN')
    qcToken = await createTestSession(qc.id)
    const adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Search Test' }),
      }),
    )
    selfProjectId = (await projRes.json()).project.id
    await prisma.project.update({ where: { id: selfProjectId }, data: { isSelf: true } })
    await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })

    await createTicket({ title: 'Login button broken', description: 'cannot click', priority: 'HIGH', route: '/login' })
    await createTicket({ title: 'Dashboard chart misaligned', description: 'overlaps on mobile', priority: 'LOW', route: '/admin' })
    await createTicket({ title: 'Export crashes', description: 'login session lost during export', priority: 'CRITICAL' })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('matches title substring (case-insensitive)', async () => {
    const { tickets } = await list('status=all&q=login')
    const titles = tickets.map((t) => t.title)
    // "Login button broken" (title) + "Export crashes" (description mentions login)
    expect(titles).toContain('Login button broken')
    expect(titles).toContain('Export crashes')
    expect(titles).not.toContain('Dashboard chart misaligned')
  })

  it('matches route substring', async () => {
    const { tickets } = await list('status=all&q=/admin')
    expect(tickets.map((t) => t.title)).toEqual(['Dashboard chart misaligned'])
  })

  it('returns empty list when nothing matches', async () => {
    const { tickets } = await list('status=all&q=zzzznomatch')
    expect(tickets).toHaveLength(0)
  })

  it('sorts by title ascending', async () => {
    const { tickets } = await list('status=all&sort=title&order=asc')
    expect(tickets.map((t) => t.title)).toEqual([
      'Dashboard chart misaligned',
      'Export crashes',
      'Login button broken',
    ])
  })

  it('sorts by priority ascending (LOW first)', async () => {
    const { tickets } = await list('status=all&sort=priority&order=asc')
    expect(tickets.map((t) => t.title)).toEqual([
      'Dashboard chart misaligned', // LOW
      'Login button broken', // HIGH
      'Export crashes', // CRITICAL
    ])
  })

  it('defaults to priority desc when no sort given', async () => {
    const { tickets } = await list('status=all')
    expect(tickets[0].title).toBe('Export crashes') // CRITICAL first
  })
})
