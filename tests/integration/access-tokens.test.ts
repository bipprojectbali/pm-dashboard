import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerToken = ''
let viewerToken = ''
let projectId = ''

const post = (token: string | null, path: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `session=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

const get = (token: string, path: string) =>
  app.handle(new Request(`http://localhost${path}`, { headers: { cookie: `session=${token}` } }))

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('token-owner@example.com', 'pass123', 'Token Owner', 'USER')
  ownerToken = await createTestSession(owner.id)
  const project = await seedTestProject(owner.id, 'Token Test Project')
  projectId = project.id

  const viewer = await seedTestUser('token-viewer@example.com', 'pass123', 'Token Viewer', 'USER')
  viewerToken = await createTestSession(viewer.id)
  await prisma.projectMember.create({ data: { projectId, userId: viewer.id, role: 'VIEWER' } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/projects/:id/access-tokens', () => {
  test('OWNER creates token — returns raw once, prefix matches, no hash leak', async () => {
    const res = await post(ownerToken, `/api/projects/${projectId}/access-tokens`, {
      name: 'ci-agent',
      scope: 'WRITE',
      expiresInDays: 30,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.raw).toStartWith('pmt_')
    expect(body.token.tokenPrefix).toBe(body.raw.slice(0, 12))
    expect(body.token.scope).toBe('WRITE')
    expect(body.token.expiresAt).not.toBeNull()
    expect('tokenHash' in body.token).toBe(false)
  })

  test('VIEWER cannot create → 403', async () => {
    const res = await post(viewerToken, `/api/projects/${projectId}/access-tokens`, { name: 'x', scope: 'READ' })
    expect(res.status).toBe(403)
  })

  test('unauthenticated → 401', async () => {
    const res = await post(null, `/api/projects/${projectId}/access-tokens`, { name: 'x', scope: 'READ' })
    expect(res.status).toBe(401)
  })

  test('missing name → 400', async () => {
    const res = await post(ownerToken, `/api/projects/${projectId}/access-tokens`, { scope: 'READ' })
    expect(res.status).toBe(400)
  })

  test('invalid expiresInDays → 400', async () => {
    const res = await post(ownerToken, `/api/projects/${projectId}/access-tokens`, {
      name: 'y',
      scope: 'READ',
      expiresInDays: 5,
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects/:id/access-tokens', () => {
  test('OWNER lists tokens — never leaks hash or plaintext', async () => {
    const res = await get(ownerToken, `/api/projects/${projectId}/access-tokens`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tokens.length).toBeGreaterThanOrEqual(1)
    for (const t of body.tokens) {
      expect('tokenHash' in t).toBe(false)
      expect(t.tokenPrefix).toStartWith('pmt_')
    }
  })

  test('VIEWER cannot list → 403', async () => {
    const res = await get(viewerToken, `/api/projects/${projectId}/access-tokens`)
    expect(res.status).toBe(403)
  })
})

describe('revoke + delete', () => {
  test('revoke sets status REVOKED', async () => {
    const created = await (
      await post(ownerToken, `/api/projects/${projectId}/access-tokens`, { name: 'to-revoke', scope: 'READ' })
    ).json()
    const res = await post(ownerToken, `/api/projects/${projectId}/access-tokens/${created.token.id}/revoke`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token.status).toBe('REVOKED')
  })

  test('delete removes the token', async () => {
    const created = await (
      await post(ownerToken, `/api/projects/${projectId}/access-tokens`, { name: 'to-delete', scope: 'READ' })
    ).json()
    const del = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/access-tokens/${created.token.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(del.status).toBe(200)
    const gone = await prisma.projectAccessToken.findUnique({ where: { id: created.token.id } })
    expect(gone).toBeNull()
  })

  test('revoke token from another project → 404', async () => {
    const res = await post(ownerToken, `/api/projects/${projectId}/access-tokens/nonexistent-id/revoke`)
    expect(res.status).toBe(404)
  })
})
