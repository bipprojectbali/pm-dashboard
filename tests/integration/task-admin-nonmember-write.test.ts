import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestTask, seedTestUser } from '../helpers'

// Regression: a SUPER_ADMIN / ADMIN who is NOT a member of a project must still
// be able to write to its tasks (backend bypasses membership via isSystemAdmin).
// The task-detail UI derives `canWrite` from this same rule; if the backend
// contract regressed, the UI fix would silently break too.
const app = createTestApp()

let ownerId: string
let projectId: string
let taskId: string
let superAdminToken: string
let viewerToken: string

const patchTask = (token: string, id: string, body: Record<string, unknown>) =>
  app.handle(
    new Request(`http://localhost/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('admin-nonmember-owner@test.com', 'pass', 'Owner', 'USER')
  ownerId = owner.id
  // System admin who is deliberately NOT added to the project's members.
  const superAdmin = await seedTestUser('admin-nonmember-sa@test.com', 'pass', 'Root', 'SUPER_ADMIN')
  superAdminToken = await createTestSession(superAdmin.id)
  // A plain USER, also not a member — must stay blocked (proves the gate exists).
  const viewer = await seedTestUser('admin-nonmember-viewer@test.com', 'pass', 'Nobody', 'USER')
  viewerToken = await createTestSession(viewer.id)

  const project = await prisma.project.create({
    data: {
      name: 'Admin Nonmember Project',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      members: { create: { userId: ownerId, role: 'OWNER' } },
    },
  })
  projectId = project.id
  const task = await seedTestTask(projectId, ownerId, { title: 'Admin can edit me' })
  taskId = task.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('PATCH /api/tasks/:id — system-admin bypass', () => {
  it('lets a SUPER_ADMIN non-member update a task (200)', async () => {
    const res = await patchTask(superAdminToken, taskId, { priority: 'HIGH' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.priority).toBe('HIGH')
  })

  it('lets a SUPER_ADMIN non-member change kind (200)', async () => {
    const res = await patchTask(superAdminToken, taskId, { kind: 'BUG' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.kind).toBe('BUG')
  })

  it('still blocks a plain USER non-member (403)', async () => {
    const res = await patchTask(viewerToken, taskId, { priority: 'LOW' })
    expect(res.status).toBe(403)
  })
})
