import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket structured create', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string

  const create = (body: Record<string, unknown>, token = qcToken) =>
    app.handle(
      new Request('http://localhost/api/qc/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
        body: JSON.stringify(body),
      }),
    )

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-struct@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-struct@test.com', 'pass', 'Admin', 'ADMIN')
    qcToken = await createTestSession(qc.id)
    const adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Struct Test' }),
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

  it('creates a structured ticket: persists columns and composes the description', async () => {
    const res = await create({
      title: 'Block button blanks page',
      stepsToReproduce: '1. open /admin\n2. click Block',
      expected: 'row turns grey',
      actual: 'white blank screen',
      environment: 'production',
      browser: 'Chrome 120',
      appVersion: '0.7.18',
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    const row = await prisma.task.findUnique({
      where: { id: json.ticket.id },
      select: {
        description: true,
        stepsToReproduce: true,
        expected: true,
        actual: true,
        environment: true,
        browser: true,
        appVersion: true,
      },
    })
    expect(row?.stepsToReproduce).toBe('1. open /admin\n2. click Block')
    expect(row?.expected).toBe('row turns grey')
    expect(row?.actual).toBe('white blank screen')
    expect(row?.environment).toBe('production')
    expect(row?.browser).toBe('Chrome 120')
    expect(row?.appVersion).toBe('0.7.18')
    expect(row?.description).toContain('## Steps to reproduce')
    expect(row?.description).toContain('## Environment\nproduction · Chrome 120 · 0.7.18')
  })

  it('keeps free-text back-compat: plain description, columns null', async () => {
    const res = await create({ title: 'Legacy ticket', description: 'just a plain note' })
    const json = await res.json()
    expect(res.status).toBe(200)
    const row = await prisma.task.findUnique({
      where: { id: json.ticket.id },
      select: { description: true, stepsToReproduce: true, expected: true, actual: true },
    })
    expect(row?.description).toBe('just a plain note')
    expect(row?.stepsToReproduce).toBeNull()
    expect(row?.expected).toBeNull()
    expect(row?.actual).toBeNull()
  })

  it('rejects a structured payload missing actual', async () => {
    const res = await create({
      title: 'Half structured',
      stepsToReproduce: '1. open',
      expected: 'works',
    })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe('Steps/Expected/Actual wajib diisi')
  })

  it('rejects when neither structured fields nor description are given', async () => {
    const res = await create({ title: 'Empty body' })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe('description wajib diisi')
  })

  it('rejects when title is missing', async () => {
    const res = await create({ description: 'no title here' })
    expect(res.status).toBe(400)
  })
})
