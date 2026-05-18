import { test, expect, describe, afterAll } from 'bun:test'
import { createTestApp, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// Google OAuth kini dihandle oleh Better Auth via POST /api/auth/sign-in/social.
// Route GET /api/auth/google tidak ada — Better Auth mengelola redirect ke Google
// secara internal setelah menerima social sign-in request.
// E2E test untuk OAuth memerlukan real Google credentials + CSRF state
// sehingga tidak praktis di integration test.

describe('Google OAuth — Better Auth integration', () => {
  test('GET /api/auth/google is not a valid route (Better Auth handles social via POST)', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/google'))
    // Better Auth tidak mengenali GET /api/auth/google → 404
    expect(res.status).toBe(404)
  })

  test('POST /api/auth/sign-in/social exists and rejects missing provider', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    // Missing provider → 4xx (Better Auth validation error)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})
