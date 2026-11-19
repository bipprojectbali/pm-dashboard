// Project overdue LOCKED can be opened and decided by system admins ONLY
// (ADMIN and SUPER_ADMIN). The OWNER carve-out is gone: OWNER, PM, and plain
// members all get 403 { locked: true } on every decision path — detail, extend,
// access-tokens, and the status disposition. request-decision stays open to
// members because it is how a blocked member asks an admin to act. A healthy
// project is a regression guard: OWNER/PM keep their normal authority there.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { withLockBypass } from '../../src/lib/prisma-project-lock'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

let ownerToken = ''
let pmToken = ''
let memberToken = ''
let adminToken = ''
let superToken = ''
let lockedProjectId = ''
let healthyProjectId = ''
let previousGrace: string | null = null

const EMAILS = [
  'ao-owner@example.com',
  'ao-pm@example.com',
  'ao-member@example.com',
  'ao-admin@example.com',
  'ao-super@example.com',
]

type AdminLabel = 'ADMIN' | 'SUPER_ADMIN'
const ADMIN_LABELS: AdminLabel[] = ['ADMIN', 'SUPER_ADMIN']
const tokenOf = (label: AdminLabel) => (label === 'ADMIN' ? adminToken : superToken)

function req(session: string, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', cookie: `session=${session}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

const extendBody = (days: number) => ({
  newEndAt: new Date(Date.now() + days * DAY_MS).toISOString(),
  reason: 'keputusan admin',
})

// Only valid while the project is currently NOT locked (an admin decision just
// opened it): the data-layer guard judges the row as it is when the update runs.
async function relock() {
  await prisma.project.update({
    where: { id: lockedProjectId },
    data: { status: 'ACTIVE', endsAt: new Date(Date.now() - 30 * DAY_MS) },
  })
  invalidateProjectLockCache()
}

async function lockedProjectUntouched() {
  const row = await prisma.project.findUnique({
    where: { id: lockedProjectId },
    select: { status: true, endsAt: true },
  })
  expect(row?.status).toBe('ACTIVE')
  expect(row?.endsAt?.getTime()).toBeLessThan(Date.now())
}

beforeAll(async () => {
  const owner = await seedTestUser(EMAILS[0], 'pass123', 'AO Owner')
  const pm = await seedTestUser(EMAILS[1], 'pass123', 'AO PM')
  const member = await seedTestUser(EMAILS[2], 'pass123', 'AO Member')
  const admin = await seedTestUser(EMAILS[3], 'pass123', 'AO Admin', 'ADMIN')
  const superAdmin = await seedTestUser(EMAILS[4], 'pass123', 'AO Super', 'SUPER_ADMIN')

  ownerToken = await createTestSession(owner.id)
  pmToken = await createTestSession(pm.id)
  memberToken = await createTestSession(member.id)
  adminToken = await createTestSession(admin.id)
  superToken = await createTestSession(superAdmin.id)

  const members = {
    create: [
      { userId: owner.id, role: 'OWNER' as const },
      { userId: pm.id, role: 'PM' as const },
      { userId: member.id, role: 'MEMBER' as const },
    ],
  }
  const make = (name: string) =>
    prisma.project.create({
      data: {
        name,
        ownerId: owner.id,
        status: 'ACTIVE',
        priority: 'MEDIUM',
        visibility: 'PRIVATE',
        endsAt: new Date(Date.now() + 30 * DAY_MS),
        members,
      },
    })
  lockedProjectId = (await make('AO Locked')).id
  healthyProjectId = (await make('AO Healthy')).id

  previousGrace = (await prisma.appSetting.findUnique({ where: { key: LOCK_GRACE_SETTING_KEY } }))?.value ?? null
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: '7' },
    create: { key: LOCK_GRACE_SETTING_KEY, value: '7' },
  })
  // Created healthy, aged afterwards (the write guard refuses seeding a locked project).
  await relock()
})

afterAll(async () => {
  if (previousGrace === null) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  } else {
    await prisma.appSetting.update({ where: { key: LOCK_GRACE_SETTING_KEY }, data: { value: previousGrace } })
  }
  invalidateProjectLockCache()
  const ids = [lockedProjectId, healthyProjectId]
  await withLockBypass(async () => {
    await prisma.notification.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectExtension.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.project.deleteMany({ where: { id: { in: ids } } })
  })
  await prisma.session.deleteMany({
    where: { token: { in: [ownerToken, pmToken, memberToken, adminToken, superToken] } },
  })
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } })
})

describe('project terkunci — detail', () => {
  test('OWNER dapat 403 locked, bukan payload layar kunci', async () => {
    const res = await req(ownerToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.locked).toBe(true)
    expect(body.lockedView).toBeUndefined()
    expect(body.project).toBeUndefined()
  })

  test('PM dan MEMBER dapat 403 locked', async () => {
    for (const token of [pmToken, memberToken]) {
      const res = await req(token, 'GET', `/api/projects/${lockedProjectId}`)
      expect(res.status).toBe(403)
      expect(((await res.json()) as { locked: boolean }).locked).toBe(true)
    }
  })

  for (const label of ADMIN_LABELS) {
    test(`${label} dapat payload penuh dengan canDecide true`, async () => {
      const res = await req(tokenOf(label), 'GET', `/api/projects/${lockedProjectId}`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        project: { members: unknown[]; taskStats: unknown }
        canDecide: boolean
        lockedView?: boolean
        lock: { locked: boolean; stage: string }
      }
      expect(data.lock.locked).toBe(true)
      expect(data.lock.stage).toBe('LOCKED')
      expect(data.lockedView).toBeUndefined()
      expect(data.canDecide).toBe(true)
      expect(data.project.members.length).toBe(3)
      expect(data.project.taskStats).toBeDefined()
    })
  }
})

describe('project terkunci — extend deadline', () => {
  test('OWNER, PM, dan MEMBER ditolak 403 locked dan kunci tetap', async () => {
    for (const token of [ownerToken, pmToken, memberToken]) {
      const res = await req(token, 'POST', `/api/projects/${lockedProjectId}/extend`, extendBody(14))
      expect(res.status).toBe(403)
      expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
    }
    await lockedProjectUntouched()
    expect(await prisma.projectExtension.count({ where: { projectId: lockedProjectId } })).toBe(0)
  })

  for (const label of ADMIN_LABELS) {
    test(`${label} bisa memperpanjang dan kunci terbuka`, async () => {
      const res = await req(tokenOf(label), 'POST', `/api/projects/${lockedProjectId}/extend`, extendBody(14))
      expect(res.status).toBe(200)
      const after = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
      expect(after.status).toBe(200)
      expect(((await after.json()) as { lock: { locked: boolean } }).lock.locked).toBe(false)
      await relock()
      expect((await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)).status).toBe(403)
    })
  }
})

describe('project terkunci — access token', () => {
  test('OWNER dan PM ditolak 403 locked', async () => {
    for (const token of [ownerToken, pmToken]) {
      const res = await req(token, 'GET', `/api/projects/${lockedProjectId}/access-tokens`)
      expect(res.status).toBe(403)
      expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
    }
  })

  test('MEMBER ditolak 403', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}/access-tokens`)
    expect(res.status).toBe(403)
  })

  for (const label of ADMIN_LABELS) {
    test(`${label} lolos 200`, async () => {
      const res = await req(tokenOf(label), 'GET', `/api/projects/${lockedProjectId}/access-tokens`)
      expect(res.status).toBe(200)
    })
  }
})

describe('project terkunci — disposisi status', () => {
  test('OWNER dan PM ditolak 403 locked untuk COMPLETED dan CANCELLED', async () => {
    for (const token of [ownerToken, pmToken]) {
      for (const status of ['COMPLETED', 'CANCELLED']) {
        const res = await req(token, 'PATCH', `/api/projects/${lockedProjectId}`, { status })
        expect(res.status).toBe(403)
        expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
      }
    }
    await lockedProjectUntouched()
  })

  test('OWNER tidak bisa menyelipkan field lain bersama status', async () => {
    const res = await req(ownerToken, 'PATCH', `/api/projects/${lockedProjectId}`, {
      status: 'COMPLETED',
      priority: 'LOW',
    })
    expect(res.status).toBe(403)
    await lockedProjectUntouched()
  })

  test('ADMIN bisa menandai COMPLETED', async () => {
    const res = await req(adminToken, 'PATCH', `/api/projects/${lockedProjectId}`, { status: 'COMPLETED' })
    expect(res.status).toBe(200)
    const row = await prisma.project.findUnique({ where: { id: lockedProjectId }, select: { status: true } })
    expect(row?.status).toBe('COMPLETED')
    await relock()
  })

  test('SUPER_ADMIN bisa menandai CANCELLED', async () => {
    const res = await req(superToken, 'PATCH', `/api/projects/${lockedProjectId}`, { status: 'CANCELLED' })
    expect(res.status).toBe(200)
    const row = await prisma.project.findUnique({ where: { id: lockedProjectId }, select: { status: true } })
    expect(row?.status).toBe('CANCELLED')
    await relock()
  })
})

describe('project terkunci — request-decision tetap terbuka', () => {
  test('OWNER, PM, dan MEMBER bisa meminta keputusan', async () => {
    for (const token of [ownerToken, pmToken, memberToken]) {
      const res = await req(token, 'POST', `/api/projects/${lockedProjectId}/request-decision`)
      expect(res.status).toBe(200)
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
    }
  })
})

// Regression: losing the lock carve-out must not leak into healthy projects.
describe('project sehat — wewenang normal OWNER dan PM utuh', () => {
  test('OWNER bisa extend dan melihat access token', async () => {
    const ext = await req(ownerToken, 'POST', `/api/projects/${healthyProjectId}/extend`, extendBody(60))
    expect(ext.status).toBe(200)
    const tokens = await req(ownerToken, 'GET', `/api/projects/${healthyProjectId}/access-tokens`)
    expect(tokens.status).toBe(200)
  })

  test('PM bisa extend, melihat access token, dan mengubah field', async () => {
    const ext = await req(pmToken, 'POST', `/api/projects/${healthyProjectId}/extend`, extendBody(90))
    expect(ext.status).toBe(200)
    const tokens = await req(pmToken, 'GET', `/api/projects/${healthyProjectId}/access-tokens`)
    expect(tokens.status).toBe(200)
    const patch = await req(pmToken, 'PATCH', `/api/projects/${healthyProjectId}`, { priority: 'HIGH' })
    expect(patch.status).toBe(200)
  })

  test('canDecide false untuk OWNER dan PM, true hanya untuk admin', async () => {
    for (const [token, role] of [
      [ownerToken, 'OWNER'],
      [pmToken, 'PM'],
    ] as const) {
      const res = await req(token, 'GET', `/api/projects/${healthyProjectId}`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { myRole: string; canWrite: boolean; canDecide: boolean }
      expect(data.myRole).toBe(role)
      expect(data.canWrite).toBe(true)
      expect(data.canDecide).toBe(false)
    }
    const admin = await req(adminToken, 'GET', `/api/projects/${healthyProjectId}`)
    expect(((await admin.json()) as { canDecide: boolean }).canDecide).toBe(true)
  })

  test('MEMBER tetap tidak bisa extend project sehat', async () => {
    const res = await req(memberToken, 'POST', `/api/projects/${healthyProjectId}/extend`, extendBody(120))
    expect(res.status).toBe(403)
  })
})
