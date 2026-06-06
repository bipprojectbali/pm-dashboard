import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let userToken: string
let adminToken: string
let superToken: string

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('user-chat-test@example.com', 'x', 'U', 'USER')
  const admin = await seedTestUser('admin-chat-test@example.com', 'x', 'A', 'ADMIN')
  const sa = await seedTestUser('sa-chat-test@example.com', 'x', 'S', 'SUPER_ADMIN')
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

describe('GET /api/admin/chat/sync/status', () => {
  test('403 without cookie', async () => {
    const res = await get('/api/admin/chat/sync/status')
    expect(res.status).toBe(403)
  })

  test('403 for USER role', async () => {
    const res = await get('/api/admin/chat/sync/status', userToken)
    expect(res.status).toBe(403)
  })

  test('200 for ADMIN — returns totalDocuments, lastSync, breakdown', async () => {
    const res = await get('/api/admin/chat/sync/status', adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.totalDocuments).toBe('number')
    expect('lastSync' in body).toBe(true)
    expect(typeof body.breakdown).toBe('object')
  })

  test('200 for SUPER_ADMIN', async () => {
    const res = await get('/api/admin/chat/sync/status', superToken)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/chat/stream', () => {
  test('403 without cookie', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('403 for USER role', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `session=${userToken}`,
        },
        body: JSON.stringify({ messages: [] }),
      }),
    )
    expect(res.status).toBe(403)
  })
})
