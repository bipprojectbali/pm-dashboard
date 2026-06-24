import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { invalidatePermissionCache } from '../../src/lib/permission-config'
import {
  cleanupTestData,
  createTestApp,
  createTestSession,
  prisma,
  seedTestProject,
  seedTestUser,
} from '../helpers'

const app = createTestApp()

async function clearPermSettings() {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'permissions.' } } })
  invalidatePermissionCache()
}

async function makeRequest(path: string, method: string, token: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        cookie: `session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
}

let superToken: string
let adminToken: string
let userToken: string
let superUserId: string
let adminUserId: string
let regularUserId: string

beforeAll(async () => {
  await cleanupTestData()
  const superUser = await seedTestUser('super@test.com', 'pass123', 'Super Admin', 'SUPER_ADMIN')
  const adminUser = await seedTestUser('admin@test.com', 'pass123', 'Admin User', 'ADMIN')
  const regularUser = await seedTestUser('user@test.com', 'pass123', 'Regular User', 'USER')
  superToken = await createTestSession(superUser.id)
  adminToken = await createTestSession(adminUser.id)
  userToken = await createTestSession(regularUser.id)
  superUserId = superUser.id
  adminUserId = adminUser.id
  regularUserId = regularUser.id
})

afterAll(cleanupTestData)

beforeEach(clearPermSettings)
afterEach(clearPermSettings)

describe('GET /api/admin/permission-rules', () => {
  test('403 untuk non-SUPER_ADMIN (ADMIN)', async () => {
    const res = await makeRequest('/api/admin/permission-rules', 'GET', adminToken)
    expect(res.status).toBe(403)
  })

  test('403 untuk regular user', async () => {
    const res = await makeRequest('/api/admin/permission-rules', 'GET', userToken)
    expect(res.status).toBe(403)
  })

  test('SUPER_ADMIN dapat list 4 rules dengan shape lengkap', async () => {
    const res = await makeRequest('/api/admin/permission-rules', 'GET', superToken)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { rules: unknown[] }
    expect(data.rules).toHaveLength(4)
    for (const rule of data.rules as Array<{
      key: string
      label: string
      description: string
      type: string
      options: string[]
      default: string[]
      current: string[]
      isDefault: boolean
    }>) {
      expect(rule.key).toBeTruthy()
      expect(rule.label).toBeTruthy()
      expect(rule.description).toBeTruthy()
      expect(rule.type).toBeTruthy()
      expect(Array.isArray(rule.options)).toBe(true)
      expect(Array.isArray(rule.default)).toBe(true)
      expect(Array.isArray(rule.current)).toBe(true)
      expect(typeof rule.isDefault).toBe('boolean')
    }
  })

  test('isDefault=true saat tidak ada override DB', async () => {
    const res = await makeRequest('/api/admin/permission-rules', 'GET', superToken)
    const data = (await res.json()) as { rules: Array<{ isDefault: boolean }> }
    expect(data.rules.every((r) => r.isDefault)).toBe(true)
  })
})

describe('PUT /api/admin/permission-rules/:key', () => {
  const validKey = encodeURIComponent('permissions.project.delete.allowedProjectRoles')
  const createKey = encodeURIComponent('permissions.project.create.allowedRoles')
  const taskDeleteKey = encodeURIComponent('permissions.task.delete.allowedProjectRoles')
  const taskWriteKey = encodeURIComponent('permissions.task.write.minProjectRole')

  test('403 untuk non-SUPER_ADMIN', async () => {
    const res = await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', adminToken, {
      value: ['OWNER', 'PM'],
    })
    expect(res.status).toBe(403)
  })

  test('400 untuk key tidak dikenal', async () => {
    const bad = encodeURIComponent('permissions.nonexistent.key')
    const res = await makeRequest(`/api/admin/permission-rules/${bad}`, 'PUT', superToken, { value: ['OWNER'] })
    expect(res.status).toBe(400)
  })

  test('400 untuk nilai tidak valid', async () => {
    const res = await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', superToken, {
      value: ['SUPER_ADMIN', 'GOD'],
    })
    expect(res.status).toBe(400)
  })

  test('400 untuk array kosong', async () => {
    const res = await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', superToken, { value: [] })
    expect(res.status).toBe(400)
  })

  test('400 untuk bukan array', async () => {
    const res = await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', superToken, { value: 'OWNER' })
    expect(res.status).toBe(400)
  })

  test('update berhasil + isDefault berubah', async () => {
    const res = await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', superToken, {
      value: ['OWNER', 'PM'],
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; key: string; value: string[] }
    expect(data.ok).toBe(true)
    expect(data.value).toEqual(['OWNER', 'PM'])

    // Verifikasi via GET
    const getRes = await makeRequest('/api/admin/permission-rules', 'GET', superToken)
    const getBody = (await getRes.json()) as { rules: Array<{ key: string; current: string[]; isDefault: boolean }> }
    const rule = getBody.rules.find((r) => r.key === 'permissions.project.delete.allowedProjectRoles')
    expect(rule?.current).toEqual(['OWNER', 'PM'])
    expect(rule?.isDefault).toBe(false)
  })

  test('update tulis AuditLog PERMISSION_RULE_UPDATED', async () => {
    await makeRequest(`/api/admin/permission-rules/${validKey}`, 'PUT', superToken, { value: ['OWNER', 'PM'] })
    const log = await prisma.auditLog.findFirst({
      where: { action: 'PERMISSION_RULE_UPDATED', userId: superUserId },
      orderBy: { createdAt: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log?.detail).toContain('permissions.project.delete.allowedProjectRoles')
  })
})

describe('Permission config efek ke route — project create', () => {
  test('ADMIN bisa create project dengan rule default', async () => {
    const res = await makeRequest('/api/projects', 'POST', adminToken, {
      name: 'Admin Project',
      description: 'Test',
      status: 'ACTIVE',
      priority: 'MEDIUM',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { project: { id: string } }
    if (body.project?.id) await prisma.project.delete({ where: { id: body.project.id } })
  })

  test('USER tidak bisa create project (default hanya ADMIN+SUPER_ADMIN)', async () => {
    const res = await makeRequest('/api/projects', 'POST', userToken, {
      name: 'User Project',
      description: 'Test',
      status: 'ACTIVE',
      priority: 'MEDIUM',
    })
    expect(res.status).toBe(403)
  })

  test('ADMIN tidak bisa create project setelah rule dikunci ke SUPER_ADMIN only', async () => {
    const createKey = encodeURIComponent('permissions.project.create.allowedRoles')
    await makeRequest(`/api/admin/permission-rules/${createKey}`, 'PUT', superToken, { value: ['SUPER_ADMIN'] })

    const res = await makeRequest('/api/projects', 'POST', adminToken, {
      name: 'Locked Out',
      description: 'Test',
      status: 'ACTIVE',
      priority: 'MEDIUM',
    })
    expect(res.status).toBe(403)
  })

  test('SUPER_ADMIN selalu bisa create project meskipun rule dikunci ke SUPER_ADMIN', async () => {
    const createKey = encodeURIComponent('permissions.project.create.allowedRoles')
    await makeRequest(`/api/admin/permission-rules/${createKey}`, 'PUT', superToken, { value: ['SUPER_ADMIN'] })

    const res = await makeRequest('/api/projects', 'POST', superToken, {
      name: 'Super Project',
      description: 'Test',
      status: 'ACTIVE',
      priority: 'MEDIUM',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { project: { id: string } }
    if (body.project?.id) await prisma.project.delete({ where: { id: body.project.id } })
  })
})

describe('Permission config efek ke route — task delete', () => {
  let projectId: string
  let taskId: string
  let pmToken: string
  let pmUserId: string

  beforeEach(async () => {
    const superUser = await prisma.user.findFirst({ where: { email: 'super@test.com' } })
    const proj = await seedTestProject(superUser!.id, 'Task Delete Test Project')
    projectId = proj.id

    const pmUser = await seedTestUser('pm-del@test.com', 'pass123', 'PM User Del', 'USER')
    pmUserId = pmUser.id
    pmToken = await createTestSession(pmUser.id)
    await prisma.projectMember.create({ data: { projectId, userId: pmUser.id, role: 'PM' } })

    const task = await prisma.task.create({
      data: {
        projectId,
        reporterId: superUser!.id,
        title: 'Task to delete',
        description: 'desc',
        kind: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    })
    taskId = task.id
  })

  afterEach(async () => {
    await prisma.task.deleteMany({ where: { projectId } })
    await prisma.projectMember.deleteMany({ where: { projectId } })
    await prisma.project.delete({ where: { id: projectId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { email: 'pm-del@test.com' } })
    await prisma.session.deleteMany({ where: { userId: pmUserId } })
  })

  test('PM bisa hapus task dengan rule default ["OWNER","PM"]', async () => {
    const res = await makeRequest(`/api/tasks/${taskId}`, 'DELETE', pmToken, { reason: 'test cleanup' })
    expect(res.status).toBe(200)
  })

  test('PM tidak bisa hapus task setelah rule dikunci ke ["OWNER"] only', async () => {
    // Restore task jika sudah terhapus
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing || existing.deletedAt) {
      const superUser = await prisma.user.findFirst({ where: { email: 'super@test.com' } })
      const newTask = await prisma.task.create({
        data: {
          projectId,
          reporterId: superUser!.id,
          title: 'Task to delete 2',
          description: 'desc',
          kind: 'TASK',
          status: 'OPEN',
          priority: 'MEDIUM',
        },
      })
      taskId = newTask.id
    }

    const taskDeleteKey = encodeURIComponent('permissions.task.delete.allowedProjectRoles')
    await makeRequest(`/api/admin/permission-rules/${taskDeleteKey}`, 'PUT', superToken, { value: ['OWNER'] })

    const res = await makeRequest(`/api/tasks/${taskId}`, 'DELETE', pmToken, { reason: 'test cleanup' })
    expect(res.status).toBe(403)
  })
})
