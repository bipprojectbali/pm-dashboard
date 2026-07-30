import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { addConnection, removeConnection } from '../../src/lib/presence'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Minimal ServerWebSocket stub — presence only reads ws.data.userId and calls ws.send().
// biome-ignore lint/suspicious/noExplicitAny: test stub, not a real socket
function fakeWs(userId: string): any {
  return { data: { userId }, send: () => {} }
}

const app = createTestApp()

let userToken: string
let adminToken: string
let superToken: string

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('user-admin-test@example.com', 'x', 'U', 'USER')
  const admin = await seedTestUser('admin-admin-test@example.com', 'x', 'A', 'ADMIN')
  const sa = await seedTestUser('sa-admin-test@example.com', 'x', 'S', 'SUPER_ADMIN')
  userToken = await createTestSession(user.id)
  adminToken = await createTestSession(admin.id)
  superToken = await createTestSession(sa.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

function get(pathname: string, token?: string) {
  return app.handle(
    new Request(`http://localhost${pathname}`, {
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  )
}

function put(pathname: string, body: unknown, token?: string) {
  return app.handle(
    new Request(`http://localhost${pathname}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { cookie: `session=${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )
}

const ADMIN_READ_ENDPOINTS = [
  '/api/admin/users',
  '/api/admin/logs/audit',
  '/api/admin/sessions',
  '/api/admin/health',
]

describe('admin read endpoints: auth gating', () => {
  for (const path of ADMIN_READ_ENDPOINTS) {
    test(`${path} — 401 without cookie`, async () => {
      const res = await get(path)
      expect(res.status).toBe(401)
    })

    test(`${path} — 403 for USER role`, async () => {
      const res = await get(path, userToken)
      expect(res.status).toBe(403)
    })

    test(`${path} — 200 for ADMIN role`, async () => {
      const res = await get(path, adminToken)
      expect(res.status).toBe(200)
    })

    test(`${path} — 200 for SUPER_ADMIN role`, async () => {
      const res = await get(path, superToken)
      expect(res.status).toBe(200)
    })
  }
})

describe('GET /api/admin/health response shape', () => {
  test('returns services, sessions, retention, env', async () => {
    const res = await get('/api/admin/health', superToken)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(typeof body.timestamp).toBe('string')

    expect(body.services).toBeDefined()
    expect(body.services.db).toBeDefined()
    expect(typeof body.services.db.ok).toBe('boolean')
    expect(body.services.redis).toBeDefined()
    expect(typeof body.services.redis.ok).toBe('boolean')

    expect(body.sessions).toBeDefined()
    expect(typeof body.sessions.total).toBe('number')
    expect(typeof body.sessions.active).toBe('number')
    expect(typeof body.sessions.online).toBe('number')

    expect(body.retention).toBeDefined()
    expect(typeof body.retention.auditLogDays).toBe('number')

    expect(Array.isArray(body.env)).toBe(true)
    const dbUrlEntry = body.env.find((e: { key: string }) => e.key === 'DATABASE_URL')
    expect(dbUrlEntry).toBeDefined()
    expect(dbUrlEntry.required).toBe(true)
  })

  test('reports at least the three seeded active sessions', async () => {
    const res = await get('/api/admin/health', superToken)
    const body = await res.json()
    expect(body.sessions.active).toBeGreaterThanOrEqual(3)
  })
})

describe('GET /api/admin/sessions response shape', () => {
  test('returns summary + sessions array with current users', async () => {
    const res = await get('/api/admin/sessions', adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(Array.isArray(body.sessions)).toBe(true)
    expect(body.summary).toBeDefined()
    expect(typeof body.summary.totalSessions).toBe('number')
    expect(typeof body.summary.activeSessions).toBe('number')
    expect(body.summary.byRole).toBeDefined()

    const emails = body.sessions.map((s: { userEmail: string }) => s.userEmail)
    expect(emails).toContain('admin-admin-test@example.com')
    expect(emails).toContain('sa-admin-test@example.com')
  })

  test('isExpired flags expired vs active sessions correctly', async () => {
    const u = await seedTestUser('sess-expiry@example.com', 'x', 'SE', 'USER')
    await createTestSession(u.id, new Date(Date.now() + 60 * 60 * 1000)) // active (+1h)
    await createTestSession(u.id, new Date(Date.now() - 60 * 60 * 1000)) // expired (-1h)

    const res = await get('/api/admin/sessions', superToken)
    const body = await res.json()
    const mine = body.sessions.filter((s: { userEmail: string }) => s.userEmail === 'sess-expiry@example.com')
    expect(mine.length).toBe(2)
    expect(mine.filter((s: { isExpired: boolean }) => s.isExpired).length).toBe(1)
    expect(mine.filter((s: { isExpired: boolean }) => !s.isExpired).length).toBe(1)
  })

  test('an online user’s EXPIRED session is not reported as online (bug fix)', async () => {
    const u = await seedTestUser('sess-online@example.com', 'x', 'SO', 'USER')
    await createTestSession(u.id, new Date(Date.now() + 60 * 60 * 1000)) // active
    await createTestSession(u.id, new Date(Date.now() - 60 * 60 * 1000)) // expired

    // Mark the user online via presence (per-user, like a real WS connection).
    const ws = fakeWs(u.id)
    addConnection(ws, u.id, false)
    try {
      const res = await get('/api/admin/sessions', superToken)
      const body = await res.json()
      const mine = body.sessions.filter((s: { userEmail: string }) => s.userEmail === 'sess-online@example.com')
      const activeRow = mine.find((s: { isExpired: boolean }) => !s.isExpired)
      const expiredRow = mine.find((s: { isExpired: boolean }) => s.isExpired)

      // Active session inherits the user's online presence…
      expect(activeRow.isOnline).toBe(true)
      // …but the expired session must NOT — even though the same user is online.
      expect(expiredRow.isOnline).toBe(false)
    } finally {
      removeConnection(ws)
    }
  })

  test('summary counts are internally consistent with the rows', async () => {
    const res = await get('/api/admin/sessions', superToken)
    const body = await res.json()
    const rows = body.sessions as { isExpired: boolean }[]
    expect(body.summary.totalSessions).toBe(rows.length)
    expect(body.summary.activeSessions).toBe(rows.filter((r) => !r.isExpired).length)
    expect(body.summary.expiredSessions).toBe(rows.filter((r) => r.isExpired).length)
  })
})

describe('GET /api/admin/users response shape', () => {
  test('ADMIN can read the user list', async () => {
    const res = await get('/api/admin/users', adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.users)).toBe(true)
    const roles = new Set(body.users.map((u: { role: string }) => u.role))
    expect(roles.has('ADMIN')).toBe(true)
    expect(roles.has('SUPER_ADMIN')).toBe(true)
  })
})

describe('PUT /api/admin/users/:id/role', () => {
  test('403 for ADMIN (SUPER_ADMIN only)', async () => {
    const target = await seedTestUser('role-target-1@example.com', 'x', 'RT1', 'USER')
    const res = await put(`/api/admin/users/${target.id}/role`, { role: 'ADMIN' }, adminToken)
    expect(res.status).toBe(403)
  })

  test('SUPER_ADMIN can set role to QC (the doc-corrected third value)', async () => {
    const target = await seedTestUser('role-target-qc@example.com', 'x', 'RTQ', 'USER')
    const res = await put(`/api/admin/users/${target.id}/role`, { role: 'QC' }, superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.role).toBe('QC')
    const persisted = await prisma.user.findUnique({ where: { id: target.id }, select: { role: true } })
    expect(persisted?.role).toBe('QC')
  })

  test('400 on an invalid role value', async () => {
    const target = await seedTestUser('role-target-bad@example.com', 'x', 'RTB', 'USER')
    const res = await put(`/api/admin/users/${target.id}/role`, { role: 'WIZARD' }, superToken)
    expect(res.status).toBe(400)
    // role must be untouched
    const persisted = await prisma.user.findUnique({ where: { id: target.id }, select: { role: true } })
    expect(persisted?.role).toBe('USER')
  })

  test('400 when changing own role', async () => {
    const sa = await prisma.user.findUnique({ where: { email: 'sa-admin-test@example.com' }, select: { id: true } })
    const res = await put(`/api/admin/users/${sa?.id}/role`, { role: 'ADMIN' }, superToken)
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/admin/users/:id/block', () => {
  test('SUPER_ADMIN blocks a user and their sessions are purged', async () => {
    const target = await seedTestUser('block-target@example.com', 'x', 'BT', 'USER')
    await createTestSession(target.id)
    expect(await prisma.session.count({ where: { userId: target.id } })).toBeGreaterThan(0)

    const res = await put(`/api/admin/users/${target.id}/block`, { blocked: true }, superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.blocked).toBe(true)
    // blocking severs every active session (the reason the UI now confirms first)
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0)
  })

  test('SUPER_ADMIN unblocks a user', async () => {
    const target = await seedTestUser('unblock-target@example.com', 'x', 'UBT', 'USER')
    await prisma.user.update({ where: { id: target.id }, data: { blocked: true } })
    const res = await put(`/api/admin/users/${target.id}/block`, { blocked: false }, superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.blocked).toBe(false)
  })

  test('403 for ADMIN (SUPER_ADMIN only)', async () => {
    const target = await seedTestUser('block-forbidden@example.com', 'x', 'BF', 'USER')
    const res = await put(`/api/admin/users/${target.id}/block`, { blocked: true }, adminToken)
    expect(res.status).toBe(403)
  })

  test('400 when blocking self', async () => {
    const sa = await prisma.user.findUnique({ where: { email: 'sa-admin-test@example.com' }, select: { id: true } })
    const res = await put(`/api/admin/users/${sa?.id}/block`, { blocked: true }, superToken)
    expect(res.status).toBe(400)
  })
})
