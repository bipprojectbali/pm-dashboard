import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { invalidateExtensionCache } from '../../src/lib/extensions'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let userToken: string
let adminToken: string

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('ext-user@example.com', 'x', 'U', 'USER')
  const admin = await seedTestUser('ext-admin@example.com', 'x', 'A', 'SUPER_ADMIN')
  userToken = await createTestSession(user.id)
  adminToken = await createTestSession(admin.id)
})

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'extensions.' } } })
  invalidateExtensionCache()
  await cleanupTestData()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'extensions.' } } })
  invalidateExtensionCache()
})

function req(method: string, path: string, token?: string, body?: object) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { cookie: `session=${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
}

describe('GET /api/admin/extensions', () => {
  test('403 untuk non-admin', async () => {
    const res = await req('GET', '/api/admin/extensions', userToken)
    expect(res.status).toBe(403)
  })

  test('admin dapat list dengan default enabled=true', async () => {
    const res = await req('GET', '/api/admin/extensions', adminToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { extensions: { key: string; enabled: boolean }[] }
    const map = Object.fromEntries(body.extensions.map((e) => [e.key, e.enabled]))
    expect(map.github).toBe(true)
    expect(map.chat).toBe(true)
  })
})

describe('PUT /api/admin/extensions/:name', () => {
  test('403 untuk non-admin', async () => {
    const res = await req('PUT', '/api/admin/extensions/github', userToken, { enabled: false })
    expect(res.status).toBe(403)
  })

  test('400 untuk extension tak dikenal', async () => {
    const res = await req('PUT', '/api/admin/extensions/unknown', adminToken, { enabled: false })
    expect(res.status).toBe(400)
  })

  test('400 saat body enabled tidak boolean', async () => {
    const res = await req('PUT', '/api/admin/extensions/github', adminToken, { enabled: 'yes' as unknown as boolean })
    expect(res.status).toBe(400)
  })

  test('toggle github → status berubah, audit log tertulis', async () => {
    const auditBefore = await prisma.auditLog.count({ where: { action: 'EXTENSION_TOGGLED' } })
    const res = await req('PUT', '/api/admin/extensions/github', adminToken, { enabled: false })
    expect(res.status).toBe(200)
    const status = await req('GET', '/api/admin/extensions', adminToken)
    const body = (await status.json()) as { extensions: { key: string; enabled: boolean }[] }
    const map = Object.fromEntries(body.extensions.map((e) => [e.key, e.enabled]))
    expect(map.github).toBe(false)
    const auditAfter = await prisma.auditLog.count({ where: { action: 'EXTENSION_TOGGLED' } })
    expect(auditAfter).toBe(auditBefore + 1)
  })
})

describe('GET /api/extensions/status', () => {
  test('401 saat tidak login', async () => {
    const res = await req('GET', '/api/extensions/status')
    expect(res.status).toBe(401)
  })

  test('user biasa boleh baca status', async () => {
    const res = await req('GET', '/api/extensions/status', userToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { enabled: { github: boolean; chat: boolean } }
    expect(body.enabled.github).toBe(true)
    expect(body.enabled.chat).toBe(true)
  })
})

describe('Webhook GitHub gating', () => {
  test('OFF → 200 ok-but-skipped, log extension_disabled', async () => {
    await req('PUT', '/api/admin/extensions/github', adminToken, { enabled: false })
    const before = await prisma.githubWebhookLog.count({ where: { reason: 'extension_disabled' } })
    const res = await app.handle(
      new Request('http://localhost/webhooks/github', {
        method: 'POST',
        headers: { 'x-github-event': 'push', 'x-github-delivery': 'test-1' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { skipped?: boolean }
    expect(body.skipped).toBe(true)
    const after = await prisma.githubWebhookLog.count({ where: { reason: 'extension_disabled' } })
    expect(after).toBe(before + 1)
  })
})

describe('Chat AI endpoint gating', () => {
  test('OFF → /chat/sync balas 503', async () => {
    await req('PUT', '/api/admin/extensions/chat', adminToken, { enabled: false })
    const res = await req('POST', '/api/admin/chat/sync', adminToken)
    expect(res.status).toBe(503)
  })
})
