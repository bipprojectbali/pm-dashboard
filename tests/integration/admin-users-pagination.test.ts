import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let superToken = ''
let userToken = ''

beforeAll(async () => {
  await cleanupTestData()

  const sa = await seedTestUser('sa-users-pg@example.com', 'x', 'Super Paging', 'SUPER_ADMIN')
  superToken = await createTestSession(sa.id)

  const plain = await seedTestUser('plain-users-pg@example.com', 'x', 'Plain User', 'USER')
  userToken = await createTestSession(plain.id)

  // Seed 25 additional USER-role accounts with a searchable marker in the name.
  for (let i = 1; i <= 25; i++) {
    const n = String(i).padStart(2, '0')
    await seedTestUser(`paging-user-${n}@example.com`, 'x', `Paging Person ${n}`, 'USER')
  }
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

describe('GET /api/admin/users — backward compatibility', () => {
  test('no query params returns full roster without total field', async () => {
    const res = await get('/api/admin/users', superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.users)).toBe(true)
    // 1 SA + 1 plain + 25 seeded = 27
    expect(body.users.length).toBe(27)
    expect(body.total).toBeUndefined()
  })
})

describe('GET /api/admin/users — pagination', () => {
  test('limit returns paginated shape with total', async () => {
    const res = await get('/api/admin/users?limit=10&offset=0', superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(10)
    expect(body.total).toBe(27)
    expect(body.limit).toBe(10)
    expect(body.offset).toBe(0)
  })

  test('offset returns a different page', async () => {
    const r1 = await get('/api/admin/users?limit=10&offset=0', superToken).then((r) => r.json())
    const r2 = await get('/api/admin/users?limit=10&offset=10', superToken).then((r) => r.json())
    const ids1 = new Set(r1.users.map((u: { id: string }) => u.id))
    for (const u of r2.users) expect(ids1.has(u.id)).toBe(false)
  })

  test('limit is capped at 200', async () => {
    const res = await get('/api/admin/users?limit=9999', superToken)
    const body = await res.json()
    expect(body.limit).toBeLessThanOrEqual(200)
  })
})

describe('GET /api/admin/users — search filter', () => {
  test('search matches name substring (case-insensitive)', async () => {
    const res = await get('/api/admin/users?search=paging+person&limit=50', superToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(25)
    for (const u of body.users) expect(u.name.toLowerCase()).toContain('paging person')
  })

  test('search matches email substring', async () => {
    const res = await get('/api/admin/users?search=paging-user-01&limit=50', superToken)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.users[0].email).toBe('paging-user-01@example.com')
  })

  test('search with no match returns empty result set', async () => {
    const res = await get('/api/admin/users?search=zzz-no-such-person&limit=50', superToken)
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.users).toHaveLength(0)
  })
})

describe('GET /api/admin/users — role filter', () => {
  test('role=USER excludes the super admin', async () => {
    const res = await get('/api/admin/users?role=USER&limit=50', superToken)
    const body = await res.json()
    for (const u of body.users) expect(u.role).toBe('USER')
    expect(body.total).toBe(26) // 25 seeded + 1 plain user
  })

  test('invalid role returns 400', async () => {
    const res = await get('/api/admin/users?role=WIZARD', superToken)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/users — auth gating still enforced', () => {
  test('no cookie returns 401', async () => {
    const res = await get('/api/admin/users?limit=10')
    expect(res.status).toBe(401)
  })

  test('USER role returns 403', async () => {
    const res = await get('/api/admin/users?limit=10', userToken)
    expect(res.status).toBe(403)
  })
})
