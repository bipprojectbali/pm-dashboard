import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000
const GRACE_DAYS = 7

let ownerId: string
let pmId: string
let memberId: string
let adminId: string
let outsiderId: string
let memberToken: string
let outsiderToken: string
let pmToken: string

/** Project ACTIVE dengan endsAt relatif hari ini; offset negatif = sudah lewat. */
async function seedProject(name: string, endsAtOffsetDays: number) {
  return prisma.project.create({
    data: {
      name,
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      endsAt: new Date(Date.now() + endsAtOffsetDays * DAY_MS),
      members: {
        create: [
          { userId: ownerId, role: 'OWNER' },
          { userId: pmId, role: 'PM' },
          { userId: memberId, role: 'MEMBER' },
        ],
      },
    },
  })
}

function requestDecision(projectId: string, token?: string) {
  return app.handle(
    new Request(`http://localhost/api/projects/${projectId}/request-decision`, {
      method: 'POST',
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  )
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('lock-owner@example.com', 'x', 'Owner', 'USER')
  const pm = await seedTestUser('lock-pm@example.com', 'x', 'PM', 'USER')
  const member = await seedTestUser('lock-member@example.com', 'x', 'Member', 'USER')
  const admin = await seedTestUser('lock-admin@example.com', 'x', 'Admin', 'SUPER_ADMIN')
  const outsider = await seedTestUser('lock-outsider@example.com', 'x', 'Outsider', 'USER')
  ownerId = owner.id
  pmId = pm.id
  memberId = member.id
  adminId = admin.id
  outsiderId = outsider.id
  memberToken = await createTestSession(member.id)
  outsiderToken = await createTestSession(outsider.id)
  pmToken = await createTestSession(pm.id)
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: String(GRACE_DAYS) },
    create: { key: LOCK_GRACE_SETTING_KEY, value: String(GRACE_DAYS) },
  })
  invalidateProjectLockCache()
})

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  invalidateProjectLockCache()
  await cleanupTestData()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.notification.deleteMany()
  await prisma.project.deleteMany()
})

describe('POST /api/projects/:id/request-decision', () => {
  test('401 saat tidak login', async () => {
    const p = await seedProject('Locked A', -(GRACE_DAYS + 2))
    expect((await requestDecision(p.id)).status).toBe(401)
  })

  test('404 saat project tidak ada', async () => {
    const res = await requestDecision('00000000-0000-0000-0000-000000000000', memberToken)
    expect(res.status).toBe(404)
  })

  test('403 untuk non-anggota', async () => {
    const p = await seedProject('Locked B', -(GRACE_DAYS + 2))
    const res = await requestDecision(p.id, outsiderToken)
    expect(res.status).toBe(403)
    expect(await prisma.notification.count({ where: { actorId: outsiderId } })).toBe(0)
  })

  test('400 saat project belum terkunci', async () => {
    const p = await seedProject('Not Locked', -1)
    const res = await requestDecision(p.id, memberToken)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('belum terkunci')
    expect(await prisma.notification.count({ where: { projectId: p.id } })).toBe(0)
  })

  test('golden path: anggota terblokir memicu notifikasi ke owner, PM, dan system admin', async () => {
    const p = await seedProject('Locked C', -(GRACE_DAYS + 3))
    const auditBefore = await prisma.auditLog.count({ where: { action: 'PROJECT_DECISION_REQUESTED' } })
    const res = await requestDecision(p.id, memberToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deduped: boolean; notified: number }
    expect(body).toEqual({ ok: true, deduped: false, notified: 3 })

    const notifications = await prisma.notification.findMany({
      where: { projectId: p.id, kind: 'PROJECT_DECISION_REQUESTED' },
      select: { recipientId: true, actorId: true, body: true },
    })
    expect(notifications.map((n) => n.recipientId).sort()).toEqual([ownerId, pmId, adminId].sort())
    expect(notifications.every((n) => n.actorId === memberId)).toBe(true)
    expect(notifications[0]?.body).toContain('perpanjang deadline')

    expect(await prisma.auditLog.count({ where: { action: 'PROJECT_DECISION_REQUESTED' } })).toBe(auditBefore + 1)
  })

  test('panggilan kedua dari caller yang sama di-dedup tanpa notifikasi baru', async () => {
    const p = await seedProject('Locked D', -(GRACE_DAYS + 3))
    await requestDecision(p.id, memberToken)
    const before = await prisma.notification.count({ where: { projectId: p.id } })
    const res = await requestDecision(p.id, memberToken)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deduped: true, notified: 0 })
    expect(await prisma.notification.count({ where: { projectId: p.id } })).toBe(before)
  })

  test('caller lain tetap bisa meminta meski caller pertama sudah di-dedup', async () => {
    const p = await seedProject('Locked E', -(GRACE_DAYS + 3))
    await requestDecision(p.id, memberToken)
    const res = await requestDecision(p.id, pmToken)
    const body = (await res.json()) as { deduped: boolean; notified: number }
    expect(body.deduped).toBe(false)
    expect(body.notified).toBeGreaterThan(0)
    expect(await prisma.notification.count({ where: { projectId: p.id, actorId: pmId } })).toBe(body.notified)
  })
})
