import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('DELETE /api/tasks/:id/evidence/:evidenceId', () => {
  const app = createTestApp()
  let ownerToken: string
  let viewerToken: string
  let ownerId: string
  let viewerId: string
  let projectId: string
  let taskId: string

  const seedEvidence = () =>
    prisma.taskEvidence.create({ data: { taskId, kind: 'LINK', url: 'https://example.com/log', note: 'n' } })

  const del = (token: string | null, tid: string, evId: string) =>
    app.handle(
      new Request(`http://localhost/api/tasks/${tid}/evidence/${evId}`, {
        method: 'DELETE',
        headers: token ? { Cookie: `session=${token}` } : {},
      }),
    )

  beforeAll(async () => {
    await cleanupTestData()
    const owner = await seedTestUser('ev-owner@test.com', 'pass', 'Owner', 'USER')
    const viewer = await seedTestUser('ev-viewer@test.com', 'pass', 'Viewer', 'USER')
    ownerId = owner.id
    viewerId = viewer.id
    ownerToken = await createTestSession(owner.id)
    viewerToken = await createTestSession(viewer.id)
    const project = await prisma.project.create({
      data: {
        name: 'Evidence Del Project',
        ownerId,
        status: 'ACTIVE',
        priority: 'MEDIUM',
        visibility: 'PRIVATE',
        members: { create: [{ userId: ownerId, role: 'OWNER' }, { userId: viewerId, role: 'VIEWER' }] },
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

  it('owner (writable member) can delete evidence', async () => {
    const ev = await seedEvidence()
    const res = await del(ownerToken, taskId, ev.id)
    expect(res.status).toBe(200)
    const gone = await prisma.taskEvidence.findUnique({ where: { id: ev.id } })
    expect(gone).toBeNull()
  })

  it('VIEWER cannot delete → 403, row unchanged', async () => {
    const ev = await seedEvidence()
    const res = await del(viewerToken, taskId, ev.id)
    expect(res.status).toBe(403)
    const still = await prisma.taskEvidence.findUnique({ where: { id: ev.id } })
    expect(still).not.toBeNull()
    await prisma.taskEvidence.delete({ where: { id: ev.id } })
  })

  it('unauthenticated → 401', async () => {
    const ev = await seedEvidence()
    const res = await del(null, taskId, ev.id)
    expect(res.status).toBe(401)
    await prisma.taskEvidence.delete({ where: { id: ev.id } })
  })

  it('unknown evidence id → 404', async () => {
    const res = await del(ownerToken, taskId, 'nonexistent')
    expect(res.status).toBe(404)
  })

  it('evidence id not on the given task → 404 (no cross-task delete)', async () => {
    const ev = await seedEvidence()
    const otherTask = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'T2', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    const res = await del(ownerToken, otherTask.id, ev.id)
    expect(res.status).toBe(404)
    const still = await prisma.taskEvidence.findUnique({ where: { id: ev.id } })
    expect(still).not.toBeNull()
    await prisma.taskEvidence.delete({ where: { id: ev.id } })
  })
})
