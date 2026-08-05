import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Covers PUT /api/me/profile: persistence of the display name, trimming,
// and validation (empty/too-long name rejected).
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
