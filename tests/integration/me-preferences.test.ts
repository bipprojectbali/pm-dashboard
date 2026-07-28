import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Covers GET/PUT /api/me/preferences: persistence of pmDefaultTab +
// tasksDefaultFilter, enum sanitization, and that the removed tableDensity is
// never echoed back (dropped on read and write).
const app = createTestApp()

let token = ''

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('prefs-user@example.com', 'pass123', 'Prefs User', 'USER')
  token = await createTestSession(user.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

function get() {
  return app.handle(new Request('http://localhost/api/me/preferences', { headers: { cookie: `session=${token}` } }))
}
function put(body: Record<string, unknown>) {
  return app.handle(
    new Request('http://localhost/api/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )
}

describe('GET /api/me/preferences', () => {
  test('returns defaults for a fresh user and never includes tableDensity', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const { preferences } = await res.json()
    expect(preferences.pmDefaultTab).toBe('overview')
    expect(preferences.tasksDefaultFilter).toBe('mine')
    expect(preferences).not.toHaveProperty('tableDensity')
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/me/preferences'))
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/me/preferences', () => {
  test('persists pmDefaultTab + tasksDefaultFilter', async () => {
    const res = await put({ pmDefaultTab: 'tasks', tasksDefaultFilter: 'priority' })
    expect(res.status).toBe(200)
    const { preferences } = await res.json()
    expect(preferences.pmDefaultTab).toBe('tasks')
    expect(preferences.tasksDefaultFilter).toBe('priority')

    // Persisted: a fresh GET reflects it.
    const after = await (await get()).json()
    expect(after.preferences.pmDefaultTab).toBe('tasks')
    expect(after.preferences.tasksDefaultFilter).toBe('priority')
  })

  test('drops tableDensity from the payload (not stored, not returned)', async () => {
    const res = await put({ tableDensity: 'compact', pmDefaultTab: 'team' })
    const { preferences } = await res.json()
    expect(preferences).not.toHaveProperty('tableDensity')
    expect(preferences.pmDefaultTab).toBe('team')
    // Underlying row must not carry it either.
    const row = await prisma.user.findUnique({ where: { email: 'prefs-user@example.com' }, select: { preferences: true } })
    expect(row?.preferences).not.toHaveProperty('tableDensity')
  })

  test('invalid enum values fall back to defaults', async () => {
    const res = await put({ pmDefaultTab: 'bogus', tasksDefaultFilter: 'nope' })
    const { preferences } = await res.json()
    expect(preferences.pmDefaultTab).toBe('overview')
    expect(preferences.tasksDefaultFilter).toBe('mine')
  })
})
