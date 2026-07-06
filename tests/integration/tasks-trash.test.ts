import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  cleanupTestData,
  createTestApp,
  createTestSession,
  prisma,
  seedTestProject,
  seedTestTask,
  seedTestUser,
} from '../helpers'

const app = createTestApp()

let ownerToken = ''
let ownerId = ''
let adminToken = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('trash-owner@example.com', 'pass123', 'Trash Owner', 'USER')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const admin = await seedTestUser('trash-admin@example.com', 'pass123', 'Trash Admin', 'SUPER_ADMIN')
  adminToken = await createTestSession(admin.id)
  const project = await seedTestProject(owner.id, 'Trash Project')
  projectId = project.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

/** Buat task lalu langsung soft-delete (masukkan ke trash). */
async function seedTrashedTask(title = 'Trashed Task') {
  const task = await seedTestTask(projectId, ownerId, { title })
  await prisma.task.update({
    where: { id: task.id },
    data: { deletedAt: new Date(), deletedById: ownerId, deleteReason: 'test cleanup' },
  })
  return task
}

describe('POST /api/tasks/:id/restore', () => {
  test('reporter bisa restore task dari trash (deletedAt di-clear)', async () => {
    const task = await seedTrashedTask('Restore Me')
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${task.id}/restore`, {
        method: 'POST',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const restored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.deletedById).toBeNull()
    expect(restored?.deleteReason).toBeNull()
  })

  test('task aktif (tidak di trash) → 404 Task not found in trash', async () => {
    const active = await seedTestTask(projectId, ownerId, { title: 'Active Task' })
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${active.id}/restore`, {
        method: 'POST',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Task not found in trash')
  })

  test('tanpa auth → 401', async () => {
    const task = await seedTrashedTask('No Auth Restore')
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${task.id}/restore`, { method: 'POST' }),
    )
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/tasks/:id/purge', () => {
  test('admin bisa purge task dari trash (hard delete)', async () => {
    const task = await seedTrashedTask('Purge Me')
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${task.id}/purge`, {
        method: 'DELETE',
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
  })

  test('task aktif (tidak di trash) → 404 Task not found in trash', async () => {
    const active = await seedTestTask(projectId, ownerId, { title: 'Active Purge' })
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${active.id}/purge`, {
        method: 'DELETE',
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(404)
    // task aktif harus tetap ada — tidak boleh terhapus
    expect(await prisma.task.findUnique({ where: { id: active.id } })).not.toBeNull()
  })

  test('non-admin → 403', async () => {
    const task = await seedTrashedTask('No Admin Purge')
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${task.id}/purge`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(403)
    // masih di trash, tidak terhapus. Query eksplisit deletedAt karena default
    // read sudah menyaring row ter-trash (soft-delete extension).
    expect(
      await prisma.task.findFirst({ where: { id: task.id, deletedAt: { not: null } } }),
    ).not.toBeNull()
  })
})
