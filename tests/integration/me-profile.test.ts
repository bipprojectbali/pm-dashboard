import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Covers PUT /api/me/profile (name edit) and POST/DELETE /api/me/avatar
// (profile picture upload/removal via MinIO, same storage path as task evidence).
const MINIO_READY = !!process.env.MINIO_ENDPOINT
const app = createTestApp()

let token = ''
let userEmail = ''

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('profile-user@example.com', 'pass123', 'Profile User', 'USER')
  userEmail = user.email
  token = await createTestSession(user.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

function putProfile(body: Record<string, unknown>) {
  return app.handle(
    new Request('http://localhost/api/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )
}

describe('PUT /api/me/profile', () => {
  test('updates the display name and persists it', async () => {
    const res = await putProfile({ name: 'New Name' })
    expect(res.status).toBe(200)
    const { user } = await res.json()
    expect(user.name).toBe('New Name')

    const row = await prisma.user.findUnique({ where: { email: userEmail }, select: { name: true } })
    expect(row?.name).toBe('New Name')
  })

  test('trims whitespace before saving', async () => {
    const res = await putProfile({ name: '  Trimmed Name  ' })
    const { user } = await res.json()
    expect(user.name).toBe('Trimmed Name')
  })

  test('empty/whitespace-only name → 400', async () => {
    const res = await putProfile({ name: '   ' })
    expect(res.status).toBe(400)
  })

  test('name over 100 chars → 400', async () => {
    const res = await putProfile({ name: 'a'.repeat(101) })
    expect(res.status).toBe(400)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe.if(MINIO_READY)('POST/DELETE /api/me/avatar', () => {
  test('uploads an image and sets user.image', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const form = new FormData()
    form.append('file', new File([png], 'avatar.png', { type: 'image/png' }))
    const res = await app.handle(
      new Request('http://localhost/api/me/avatar', {
        method: 'POST',
        headers: { cookie: `session=${token}` },
        body: form,
      }),
    )
    expect(res.status).toBe(200)
    const { user } = await res.json()
    expect(user.image).toContain('/api/me/avatar/')

    const row = await prisma.user.findUnique({ where: { email: userEmail }, select: { image: true } })
    expect(row?.image).toBe(user.image)
  })

  test('non-image file → 400', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'doc.txt', { type: 'text/plain' }))
    const res = await app.handle(
      new Request('http://localhost/api/me/avatar', {
        method: 'POST',
        headers: { cookie: `session=${token}` },
        body: form,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('empty file → 400', async () => {
    const form = new FormData()
    form.append('file', new File([], 'empty.png', { type: 'image/png' }))
    const res = await app.handle(
      new Request('http://localhost/api/me/avatar', {
        method: 'POST',
        headers: { cookie: `session=${token}` },
        body: form,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('unauthenticated upload → 401', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }))
    const res = await app.handle(new Request('http://localhost/api/me/avatar', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
  })

  test('clears the avatar back to null', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const form = new FormData()
    form.append('file', new File([png], 'avatar2.png', { type: 'image/png' }))
    await app.handle(
      new Request('http://localhost/api/me/avatar', {
        method: 'POST',
        headers: { cookie: `session=${token}` },
        body: form,
      }),
    )

    const delRes = await app.handle(
      new Request('http://localhost/api/me/avatar', {
        method: 'DELETE',
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(delRes.status).toBe(200)
    const { user } = await delRes.json()
    expect(user.image).toBeNull()

    const row = await prisma.user.findUnique({ where: { email: userEmail }, select: { image: true } })
    expect(row?.image).toBeNull()
  })
})
