import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Round-trip against real MinIO (bucket from .env.test — pm-dashboard-dev-test).
// Skips cleanly if MinIO isn't configured so CI without MinIO doesn't fail.
const MINIO_READY = !!process.env.MINIO_ENDPOINT

describe.if(MINIO_READY)('Evidence storage (MinIO round-trip)', () => {
  const app = createTestApp()
  let ownerToken: string
  let ownerId: string
  let projectId: string
  let taskId: string

  beforeAll(async () => {
    await cleanupTestData()
    const owner = await seedTestUser('evstore-owner@test.com', 'pass', 'Owner', 'USER')
    ownerId = owner.id
    ownerToken = await createTestSession(owner.id)
    const project = await prisma.project.create({
      data: {
        name: 'Evidence Storage Project',
        ownerId,
        status: 'ACTIVE',
        priority: 'MEDIUM',
        visibility: 'PRIVATE',
        members: { create: { userId: ownerId, role: 'OWNER' } },
      },
    })
    projectId = project.id
    const task = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'T', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    taskId = task.id
  })

  afterAll(async () => {
    await cleanupTestData()
    await prisma.$disconnect()
  })

  it('uploads → serves (bytes match) → deletes → 404, all via MinIO', async () => {
    const H = { Cookie: `session=${ownerToken}` }
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fd = new FormData()
    fd.append('file', new File([png], 'shot.png', { type: 'image/png' }))

    // upload → MinIO
    const upRes = await app.handle(
      new Request(`http://localhost/api/tasks/${taskId}/evidence/upload`, { method: 'POST', headers: H, body: fd }),
    )
    expect(upRes.status).toBe(200)
    const up = await upRes.json()
    expect(up.evidence.kind).toBe('SCREENSHOT')
    expect(up.evidence.url).toContain('/api/evidence/')
    const evidenceId = up.evidence.id
    const fileName = up.evidence.url.match(/\/api\/evidence\/([^?]+)/)![1]

    // serve → read back from MinIO, bytes must match
    const serveRes = await app.handle(
      new Request(`http://localhost/api/evidence/${fileName}?task=${taskId}`, { headers: H }),
    )
    expect(serveRes.status).toBe(200)
    const served = new Uint8Array(await serveRes.arrayBuffer())
    expect(served.length).toBe(png.length)
    expect(served[0]).toBe(0x89)

    // delete → removes from MinIO
    const delRes = await app.handle(
      new Request(`http://localhost/api/tasks/${taskId}/evidence/${evidenceId}`, { method: 'DELETE', headers: H }),
    )
    expect(delRes.status).toBe(200)

    // serve after delete → 404 (gone from MinIO, no disk fallback)
    const goneRes = await app.handle(
      new Request(`http://localhost/api/evidence/${fileName}?task=${taskId}`, { headers: H }),
    )
    expect(goneRes.status).toBe(404)
  })

  it('serving a nonexistent file → 404 (not 502)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/evidence/does-not-exist.png?task=${taskId}`, {
        headers: { Cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})
