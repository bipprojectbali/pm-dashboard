import { test, expect, describe, afterAll } from 'bun:test'
import { createTestApp, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/auth/google', () => {
  test('redirects to Google OAuth', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/google'))

    // Elysia returns 302 for redirects
    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(location).toContain('client_id=')
    expect(location).toContain('redirect_uri=')
    expect(location).toContain('scope=openid+email+profile')
    expect(location).toContain('response_type=code')
    expect(location).toContain('state=') // CSRF state parameter must be present
  })

  test('redirect_uri points to callback endpoint', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/google'))
    const location = res.headers.get('location')!
    const url = new URL(location)
    const redirectUri = url.searchParams.get('redirect_uri')
    // redirect_uri must end with the callback path (port may vary based on .env PORT)
    expect(redirectUri).toMatch(/\/api\/auth\/callback\/google$/)
  })
})

describe('GET /api/auth/callback/google', () => {
  test('redirects to login with error when no code provided', async () => {
    const res = await app.handle(new Request('http://localhost/api/auth/callback/google'))

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('/login?error=google_failed')
  })
})
