import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket image upload', () => {
  const app = createTestApp()
  let qcToken: string
  let selfProjectId: string
  let ticketId: string

  beforeAll(async () => {
    await cleanupTestData()
    const qc = await seedTestUser('qc-upload@test.com', 'pass', 'QC User', 'QC' as never)
    const admin = await seedTestUser('admin-upload@test.com', 'pass', 'Admin', 'ADMIN')
    qcToken = await createTestSession(qc.id)

    const adminToken = await createTestSession(admin.id)
    // create self-project
    const projRes = await app.handle(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
      body: JSON.stringify({ name: 'Self Project Upload Test' }),
    }))
    const proj = await projRes.json()
    selfProjectId = proj.project.id
    await prisma.project.update({ where: { id: selfProjectId }, data: { isSelf: true } })
    await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })

    // create a ticket
    const ticketRes = await app.handle(new Request('http://localhost/api/qc/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${qcToken}` },
      body: JSON.stringify({ title: 'Upload test ticket', description: 'desc', priority: 'MEDIUM' }),
    }))
    const ticketJson = await ticketRes.json()
    ticketId = ticketJson.ticket.id
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('rejects non-image file', async () => {
    const form = new FormData()
    form.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }))
    const res = await app.handle(new Request(`http://localhost/api/qc/tickets/${ticketId}/evidence/upload`, {
      method: 'POST',
      headers: { Cookie: `session=${qcToken}` },
      body: form,
    }))
    expect(res.status).toBe(415)
    const json = await res.json()
    expect(json.error).toMatch(/gambar/)
  })

  it('uploads image and creates evidence record', async () => {
    const imgBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
    ])
    const form = new FormData()
    form.append('file', new File([imgBytes], 'screenshot.png', { type: 'image/png' }))
    const res = await app.handle(new Request(`http://localhost/api/qc/tickets/${ticketId}/evidence/upload`, {
      method: 'POST',
      headers: { Cookie: `session=${qcToken}` },
      body: form,
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.evidence).toBeDefined()
    expect(json.evidence.kind).toBe('SCREENSHOT')
    expect(json.evidence.url).toContain('/api/evidence/')
    expect(json.evidence.note).toContain('screenshot.png')
  })

  it('returns 404 for ticket not in self-project', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array(8)], 'x.png', { type: 'image/png' }))
    const res = await app.handle(new Request(`http://localhost/api/qc/tickets/nonexistent-id/evidence/upload`, {
      method: 'POST',
      headers: { Cookie: `session=${qcToken}` },
      body: form,
    }))
    expect(res.status).toBe(404)
  })

  it('uploaded screenshot appears in ticket detail evidence list', async () => {
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const form = new FormData()
    form.append('file', new File([imgBytes], 'drawer-shot.png', { type: 'image/png' }))
    await app.handle(new Request(`http://localhost/api/qc/tickets/${ticketId}/evidence/upload`, {
      method: 'POST',
      headers: { Cookie: `session=${qcToken}` },
      body: form,
    }))
    const detailRes = await app.handle(new Request(`http://localhost/api/qc/tickets/${ticketId}`, {
      headers: { Cookie: `session=${qcToken}` },
    }))
    expect(detailRes.status).toBe(200)
    const { ticket } = await detailRes.json()
    const screenshots = ticket.evidence.filter((e: { kind: string }) => e.kind === 'SCREENSHOT')
    expect(screenshots.length).toBeGreaterThanOrEqual(1)
    expect(screenshots.some((e: { note: string }) => e.note?.includes('drawer-shot.png'))).toBe(true)
  })
})
