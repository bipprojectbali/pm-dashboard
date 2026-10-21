// Proofs for the data-layer overdue-lock guard (src/lib/prisma-project-lock.ts).
// Distinct from project-lock-enforcement.test.ts, which covers the route-level
// VIEWER downgrade: here every write goes through a path that was NEVER
// lock-aware — reporter identity (task trash), a project token scope (/mcp), or
// a bare prisma call (what the QC routes do, they gate on a global role only).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generateProjectToken } from '../../src/lib/project-access-tokens'
import { isProjectLockedError, recordLockActor, withLockBypass } from '../../src/lib/prisma-project-lock'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

const EMAILS = ['guard-reporter@example.com', 'guard-admin@example.com', 'guard-owner@example.com']

let reporterToken = ''
let adminToken = ''
let ownerToken = ''
let reporterId = ''
let lockedProjectId = ''
let healthyProjectId = ''
let lockedTaskId = ''
let adminTargetTaskId = ''
let bypassTaskId = ''
let healthyTaskId = ''
let writeToken = ''
let previousGrace: string | null = null

function req(session: string | null, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { cookie: `session=${session}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

function mcp(rawToken: string, method: string, params: unknown) {
  return app.handle(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  )
}

function seedTask(projectId: string, title: string) {
  return prisma.task.create({
    data: { projectId, reporterId, title, description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
  })
}

beforeAll(async () => {
  const reporter = await seedTestUser(EMAILS[0] as string, 'pass123', 'Guard Reporter')
  const admin = await seedTestUser(EMAILS[1] as string, 'pass123', 'Guard Admin', 'SUPER_ADMIN')
  const owner = await seedTestUser(EMAILS[2] as string, 'pass123', 'Guard Owner')
  reporterId = reporter.id
  reporterToken = await createTestSession(reporter.id)
  adminToken = await createTestSession(admin.id)
  ownerToken = await createTestSession(owner.id)

  const now = Date.now()
  const base = {
    ownerId: owner.id,
    status: 'ACTIVE' as const,
    priority: 'MEDIUM' as const,
    visibility: 'PRIVATE' as const,
  }
  // Seeded while the deadline is still in the future, then moved into the past:
  // creating members/tasks on an already-locked project would itself be refused.
  const locked = await prisma.project.create({
    data: {
      ...base,
      name: 'Guard Locked',
      endsAt: new Date(now + DAY_MS),
      members: { create: [{ userId: owner.id, role: 'OWNER' }, { userId: reporter.id, role: 'MEMBER' }] },
    },
  })
  lockedProjectId = locked.id
  const healthy = await prisma.project.create({
    data: {
      ...base,
      name: 'Guard Healthy',
      endsAt: new Date(now + 30 * DAY_MS),
      members: { create: [{ userId: owner.id, role: 'OWNER' }, { userId: reporter.id, role: 'MEMBER' }] },
    },
  })
  healthyProjectId = healthy.id

  lockedTaskId = (await seedTask(lockedProjectId, 'Task milik reporter')).id
  adminTargetTaskId = (await seedTask(lockedProjectId, 'Task target admin')).id
  bypassTaskId = (await seedTask(lockedProjectId, 'Task target bypass')).id
  healthyTaskId = (await seedTask(healthyProjectId, 'Task project sehat')).id

  const { raw, hash, prefix } = generateProjectToken()
  await prisma.projectAccessToken.create({
    data: {
      projectId: lockedProjectId,
      createdById: owner.id,
      name: 'guard-agent',
      tokenHash: hash,
      tokenPrefix: prefix,
      scope: 'WRITE',
      status: 'ACTIVE',
    },
  })
  writeToken = raw

  previousGrace = (await prisma.appSetting.findUnique({ where: { key: LOCK_GRACE_SETTING_KEY } }))?.value ?? null
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: '7' },
    create: { key: LOCK_GRACE_SETTING_KEY, value: '7' },
  })
  invalidateProjectLockCache()

  await prisma.project.update({ where: { id: lockedProjectId }, data: { endsAt: new Date(now - 30 * DAY_MS) } })
})

afterAll(async () => {
  if (previousGrace === null) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  } else {
    await prisma.appSetting.update({ where: { key: LOCK_GRACE_SETTING_KEY }, data: { value: previousGrace } })
  }
  invalidateProjectLockCache()
  const ids = [lockedProjectId, healthyProjectId]
  // Teardown is not a project write; it opts out of the guard explicitly.
  await withLockBypass(async () => {
    await prisma.taskComment.deleteMany({ where: { task: { projectId: { in: ids } } } })
    await prisma.task.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectAccessToken.deleteMany({ where: { projectId: lockedProjectId } })
    await prisma.projectExtension.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.notification.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.project.deleteMany({ where: { id: { in: ids } } })
  })
  await prisma.session.deleteMany({ where: { token: { in: [reporterToken, adminToken, ownerToken] } } })
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } })
})

describe('route yang tidak pernah sadar lock', () => {
  test('reporter tidak bisa men-trash task-nya sendiri di project terkunci', async () => {
    // Gate rute ini cuma "reporter atau OWNER/PM", jadi sebelum ada guard di
    // data layer penghapusan ini lolos walau project terkunci.
    const res = await req(reporterToken, 'DELETE', `/api/tasks/${lockedTaskId}`, { reason: 'bersih-bersih' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { locked?: boolean; projectId?: string }
    expect(body.locked).toBe(true)
    expect(body.projectId).toBe(lockedProjectId)

    const after = await prisma.task.findUnique({ where: { id: lockedTaskId }, select: { deletedAt: true } })
    expect(after?.deletedAt).toBeNull()
  })

  test('admin sistem tetap bisa men-trash task di project terkunci', async () => {
    const res = await req(adminToken, 'DELETE', `/api/tasks/${adminTargetTaskId}`, { reason: 'keputusan admin' })
    expect(res.status).toBe(200)
  })

  test('reporter tetap bisa men-trash task di project sehat', async () => {
    const res = await req(reporterToken, 'DELETE', `/api/tasks/${healthyTaskId}`, { reason: 'tidak relevan lagi' })
    expect(res.status).toBe(200)
  })
})

describe('/mcp sejalan dengan /api/agent/*', () => {
  test('token WRITE di project terkunci hanya dapat toolset READ', async () => {
    const res = await mcp(writeToken, 'tools/list', {})
    const j = (await res.json()) as { result: { tools: Array<{ name: string }> } }
    const names = j.result.tools.map((t) => t.name)
    expect(names).not.toContain('task_create')
    expect(names).toContain('task_list')
  })

  test('task_create lewat token WRITE ditolak saat terkunci', async () => {
    const res = await mcp(writeToken, 'tools/call', {
      name: 'task_create',
      arguments: { title: 'Dari MCP saat terkunci', description: 'harus gagal' },
    })
    const j = (await res.json()) as { error?: unknown; result?: { isError?: boolean } }
    expect(j.error ?? j.result?.isError).toBeTruthy()
    const created = await prisma.task.findFirst({
      where: { projectId: lockedProjectId, title: 'Dari MCP saat terkunci' },
      select: { id: true },
    })
    expect(created).toBeNull()
  })
})

describe('guard di client Prisma itu sendiri', () => {
  test('update task tanpa actor ditolak dengan konteks, bukan error senyap', async () => {
    // Persis apa yang handler QC lakukan (prisma.task.update, gate cuma role
    // global), tanpa harus mengutak-atik self-project milik test lain.
    recordLockActor(false)
    try {
      await prisma.task.update({ where: { id: lockedTaskId }, data: { title: 'diubah diam-diam' } })
      throw new Error('seharusnya ditolak')
    } catch (e) {
      expect(isProjectLockedError(e)).toBe(true)
      const err = e as { context: { projectId: string; model: string; operation: string; stage: string } }
      expect(err.context.projectId).toBe(lockedProjectId)
      expect(err.context.model).toBe('task')
      expect(err.context.operation).toBe('update')
      expect(err.context.stage).toBe('LOCKED')
    }
  })

  test('baris anak diresolve lewat task induknya', async () => {
    recordLockActor(false)
    // Dibungkus async fn: PrismaPromise bukan Promise asli, `rejects` menolaknya.
    const call = async () =>
      prisma.taskComment.create({
        data: { taskId: lockedTaskId, authorId: reporterId, authorTag: 'MEMBER', body: 'halo' },
      })
    await expect(call()).rejects.toThrow(/terkunci/)
  })

  test('deleteMany yang menyentuh project terkunci ditolak seluruhnya', async () => {
    recordLockActor(false)
    const call = async () =>
      prisma.task.deleteMany({ where: { projectId: { in: [lockedProjectId, healthyProjectId] } } })
    await expect(call()).rejects.toThrow(/terkunci/)
    // Ditolak seluruhnya: baris di project sehat yang ikut ter-filter pun tidak
    // terhapus, bukan sebagian lolos.
    const survivors = await prisma.task.findMany({
      where: { id: { in: [lockedTaskId, bypassTaskId] } },
      select: { id: true },
    })
    expect(survivors).toHaveLength(2)
  })

  test('withLockBypass meloloskan write yang sama', async () => {
    recordLockActor(false)
    const updated = await withLockBypass(() =>
      prisma.task.update({ where: { id: bypassTaskId }, data: { title: 'lewat bypass' } }),
    )
    expect(updated.title).toBe('lewat bypass')
  })

  test('project sehat tidak tersentuh guard', async () => {
    recordLockActor(false)
    const created = await prisma.task.create({
      data: {
        projectId: healthyProjectId,
        reporterId,
        title: 'Task baru project sehat',
        description: '',
        kind: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    })
    expect(created.id).toBeTruthy()
  })
})

describe('jalan keluar tetap hidup saat terkunci', () => {
  test('anggota terblokir bisa meminta keputusan (notifikasi tidak dijaga)', async () => {
    const res = await req(reporterToken, 'POST', `/api/projects/${lockedProjectId}/request-decision`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  test('owner bisa memperpanjang deadline dan kunci terbuka', async () => {
    const res = await req(ownerToken, 'POST', `/api/projects/${lockedProjectId}/extend`, {
      newEndAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
      reason: 'butuh waktu tambahan',
    })
    expect(res.status).toBe(200)

    const detail = await req(reporterToken, 'GET', `/api/projects/${lockedProjectId}`)
    const data = (await detail.json()) as { lock: { locked: boolean }; canWrite: boolean }
    expect(data.lock.locked).toBe(false)
    expect(data.canWrite).toBe(true)
  })
})
