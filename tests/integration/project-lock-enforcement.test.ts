import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generateProjectToken } from '../../src/lib/project-access-tokens'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

let ownerToken = ''
let memberToken = ''
let adminToken = ''
let outsiderToken = ''
let lockedProjectId = ''
let healthyProjectId = ''
let agentWriteToken = ''
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

function agentReq(token: string, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

async function seedProject(name: string, ownerId: string, memberId: string, endsAt: Date) {
  return prisma.project.create({
    data: {
      name,
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      endsAt,
      members: { create: [{ userId: ownerId, role: 'OWNER' }, { userId: memberId, role: 'MEMBER' }] },
    },
  })
}

beforeAll(async () => {
  const owner = await seedTestUser('lock-owner@example.com', 'pass123', 'Lock Owner')
  const member = await seedTestUser('lock-member@example.com', 'pass123', 'Lock Member')
  const admin = await seedTestUser('lock-admin@example.com', 'pass123', 'Lock Admin', 'SUPER_ADMIN')
  const outsider = await seedTestUser('lock-outsider@example.com', 'pass123', 'Lock Outsider')

  ownerToken = await createTestSession(owner.id)
  memberToken = await createTestSession(member.id)
  adminToken = await createTestSession(admin.id)
  outsiderToken = await createTestSession(outsider.id)

  const now = Date.now()
  lockedProjectId = (await seedProject('Lock Overdue', owner.id, member.id, new Date(now - 30 * DAY_MS))).id
  healthyProjectId = (await seedProject('Lock Healthy', owner.id, member.id, new Date(now + 30 * DAY_MS))).id

  const { raw, hash, prefix } = generateProjectToken()
  await prisma.projectAccessToken.create({
    data: {
      projectId: lockedProjectId,
      createdById: owner.id,
      name: 'lock-agent',
      tokenHash: hash,
      tokenPrefix: prefix,
      scope: 'WRITE',
      status: 'ACTIVE',
    },
  })
  agentWriteToken = raw

  previousGrace = (await prisma.appSetting.findUnique({ where: { key: LOCK_GRACE_SETTING_KEY } }))?.value ?? null
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: '7' },
    create: { key: LOCK_GRACE_SETTING_KEY, value: '7' },
  })
  invalidateProjectLockCache()
})

afterAll(async () => {
  if (previousGrace === null) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  } else {
    await prisma.appSetting.update({
      where: { key: LOCK_GRACE_SETTING_KEY },
      data: { value: previousGrace },
    })
  }
  invalidateProjectLockCache()
  await prisma.task.deleteMany({ where: { projectId: { in: [lockedProjectId, healthyProjectId] } } })
  await prisma.projectAccessToken.deleteMany({ where: { projectId: lockedProjectId } })
  await prisma.projectExtension.deleteMany({ where: { projectId: lockedProjectId } })
  await prisma.projectMember.deleteMany({ where: { projectId: { in: [lockedProjectId, healthyProjectId] } } })
  await prisma.project.deleteMany({ where: { id: { in: [lockedProjectId, healthyProjectId] } } })
  await prisma.session.deleteMany({
    where: { token: { in: [ownerToken, memberToken, adminToken, outsiderToken] } },
  })
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'lock-owner@example.com',
          'lock-member@example.com',
          'lock-admin@example.com',
          'lock-outsider@example.com',
        ],
      },
    },
  })
})

describe('project terkunci — pembacaan tetap jalan', () => {
  test('detail project tetap bisa dibuka, menandai terkunci dan read-only', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      myRole: string
      canWrite: boolean
      canDecide: boolean
      lock: { locked: boolean; stage: string; overdueDays: number }
    }
    expect(data.lock.locked).toBe(true)
    expect(data.lock.stage).toBe('LOCKED')
    expect(data.lock.overdueDays).toBeGreaterThanOrEqual(30)
    expect(data.canWrite).toBe(false)
    // Peran asli tidak disembunyikan: layar kunci butuh ini untuk tahu siapa
    // yang boleh mengambil keputusan.
    expect(data.myRole).toBe('MEMBER')
    expect(data.canDecide).toBe(false)
  })

  test('owner ditandai boleh mengambil keputusan', async () => {
    const res = await req(ownerToken, 'GET', `/api/projects/${lockedProjectId}`)
    const data = (await res.json()) as { canDecide: boolean; canWrite: boolean }
    expect(data.canDecide).toBe(true)
    expect(data.canWrite).toBe(false)
  })

  test('project sehat tidak terpengaruh', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${healthyProjectId}`)
    const data = (await res.json()) as { canWrite: boolean; lock: { locked: boolean } }
    expect(data.lock.locked).toBe(false)
    expect(data.canWrite).toBe(true)
  })
})

describe('project terkunci — penulisan ditolak', () => {
  test('member tidak bisa membuat task', async () => {
    const res = await req(memberToken, 'POST', '/api/tasks', {
      projectId: lockedProjectId,
      title: 'Task saat terkunci',
      description: 'harus ditolak',
    })
    expect(res.status).toBe(403)
  })

  test('member tetap bisa membuat task di project sehat', async () => {
    const res = await req(memberToken, 'POST', '/api/tasks', {
      projectId: healthyProjectId,
      title: 'Task normal',
      description: 'harus lolos',
    })
    expect(res.status).toBe(200)
  })

  test('owner tidak bisa mengubah field biasa', async () => {
    const res = await req(ownerToken, 'PATCH', `/api/projects/${lockedProjectId}`, {
      name: 'Nama baru saat terkunci',
    })
    expect(res.status).toBe(403)
  })

  test('owner tidak bisa menyelipkan field lain bersama status', async () => {
    const res = await req(ownerToken, 'PATCH', `/api/projects/${lockedProjectId}`, {
      status: 'COMPLETED',
      priority: 'LOW',
    })
    expect(res.status).toBe(403)
  })

  test('token agent WRITE turun jadi READ', async () => {
    const res = await agentReq(agentWriteToken, 'POST', '/api/agent/tasks', {
      title: 'Task dari agent',
      description: 'harus ditolak',
    })
    expect(res.status).toBe(403)
  })

  test('admin sistem tetap bisa menulis', async () => {
    const res = await req(adminToken, 'PATCH', `/api/projects/${lockedProjectId}`, {
      priority: 'HIGH',
    })
    expect(res.status).toBe(200)
  })

  test('bukan anggota tetap ditolak seperti biasa', async () => {
    const res = await req(outsiderToken, 'PATCH', `/api/projects/${lockedProjectId}`, {
      name: 'dari luar',
    })
    expect(res.status).toBe(403)
  })
})

describe('jalan keluar dari kunci', () => {
  test('owner bisa memperpanjang deadline dan kunci terbuka', async () => {
    const newEnd = new Date(Date.now() + 14 * DAY_MS)
    const res = await req(ownerToken, 'POST', `/api/projects/${lockedProjectId}/extend`, {
      newEndAt: newEnd.toISOString(),
      reason: 'butuh waktu tambahan',
    })
    expect(res.status).toBe(200)

    const after = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
    const data = (await after.json()) as { canWrite: boolean; lock: { locked: boolean } }
    expect(data.lock.locked).toBe(false)
    expect(data.canWrite).toBe(true)
  })

  test('owner bisa menandai project selesai walau terkunci', async () => {
    await prisma.project.update({
      where: { id: lockedProjectId },
      data: { endsAt: new Date(Date.now() - 30 * DAY_MS) },
    })
    const res = await req(ownerToken, 'PATCH', `/api/projects/${lockedProjectId}`, { status: 'COMPLETED' })
    expect(res.status).toBe(200)

    const after = await req(ownerToken, 'GET', `/api/projects/${lockedProjectId}`)
    const data = (await after.json()) as { lock: { locked: boolean; stage: string } }
    expect(data.lock.locked).toBe(false)
    expect(data.lock.stage).toBe('EXEMPT')
  })

  test('status di luar disposisi tetap ditolak saat terkunci', async () => {
    await prisma.project.update({
      where: { id: lockedProjectId },
      data: { status: 'ACTIVE', endsAt: new Date(Date.now() - 30 * DAY_MS) },
    })
    const res = await req(ownerToken, 'PATCH', `/api/projects/${lockedProjectId}`, { status: 'ON_HOLD' })
    expect(res.status).toBe(403)
  })
})
