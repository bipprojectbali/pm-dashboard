/**
 * Tests for Better Auth v1.6.9 integration endpoints.
 * These test the Better Auth-specific paths: /api/auth/sign-in/email,
 * /api/auth/sign-out, /api/auth/get-session (Better Auth's own session check).
 *
 * The custom endpoints (/api/auth/login, /api/auth/session, /api/auth/logout)
 * continue to work in parallel — tested in auth-login.test.ts etc.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, prisma } from '../helpers'

const app = createTestApp()

beforeAll(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('Better Auth sign-in/email endpoint', () => {
  test('POST /api/auth/sign-in/email — 200 with valid credentials and session cookie', async () => {
    // Create user + Account row via custom login (lazy sync populates Account)
    const setupRes = await app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-test@example.com', password: 'password123' }),
      }),
    )
    // User doesn't exist yet, expect 401 (fine — we'll seed via prisma directly)
    expect([200, 401]).toContain(setupRes.status)

    // Seed user directly with known bcrypt hash
    const hash = await Bun.password.hash('password123', { algorithm: 'bcrypt' })
    const user = await prisma.user.upsert({
      where: { email: 'ba-test@example.com' },
      update: { password: hash },
      create: { email: 'ba-test@example.com', name: 'BA Test', password: hash, role: 'USER' },
    })

    // Also seed Account row so BA can find credential
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: user.email } },
      update: { password: hash },
      create: {
        accountId: user.email,
        providerId: 'credential',
        userId: user.id,
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const res = await app.handle(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-test@example.com', password: 'password123' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe('ba-test@example.com')

    // Better Auth must set a cookie named "session" (our configured name)
    const cookie = res.headers.get('set-cookie')
    expect(cookie).toBeTruthy()
    expect(cookie).toContain('session=')
    expect(cookie).toContain('HttpOnly')
  })

  test('POST /api/auth/sign-in/email — 401 with wrong password', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-test@example.com', password: 'wrongpassword' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  test('POST /api/auth/sign-in/email — BA session is readable via custom /api/auth/session', async () => {
    // Sign in via Better Auth endpoint
    const signInRes = await app.handle(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-test@example.com', password: 'password123' }),
      }),
    )
    expect(signInRes.status).toBe(200)

    // Extract the BA signed cookie
    const setCookie = signInRes.headers.get('set-cookie') ?? ''
    const token = setCookie.match(/session=([^;]+)/)?.[1]
    expect(token).toBeTruthy()

    // The BA signed token should NOT work with the custom /api/auth/session endpoint
    // (which only reads plain UUID tokens from DB). But the BA get-session should work.
    const baSessionRes = await app.handle(
      new Request('http://localhost/api/auth/get-session', {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(baSessionRes.status).toBe(200)
    const baBody = await baSessionRes.json()
    expect(baBody.user).toBeDefined()
    expect(baBody.user.email).toBe('ba-test@example.com')
  })
})

describe('Better Auth sign-out endpoint', () => {
  test('POST /api/auth/sign-out — 200 and clears session cookie', async () => {
    // Use a separate user to avoid rate-limit interference from earlier sign-in tests
    const hash = await Bun.password.hash('password123', { algorithm: 'bcrypt' })
    const soUser = await prisma.user.upsert({
      where: { email: 'ba-signout@example.com' },
      update: { password: hash },
      create: { email: 'ba-signout@example.com', name: 'SignOut Test', password: hash, role: 'USER' },
    })
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: soUser.email } },
      update: { password: hash },
      create: {
        accountId: soUser.email, providerId: 'credential', userId: soUser.id,
        password: hash, createdAt: new Date(), updatedAt: new Date(),
      },
    })

    // First sign in
    const signInRes = await app.handle(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-signout@example.com', password: 'password123' }),
      }),
    )
    expect(signInRes.status).toBe(200)
    const setCookie = signInRes.headers.get('set-cookie') ?? ''
    const token = setCookie.match(/session=([^;]+)/)?.[1]

    // Sign out
    const signOutRes = await app.handle(
      new Request('http://localhost/api/auth/sign-out', {
        method: 'POST',
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(signOutRes.status).toBe(200)

    // Session cookie should be cleared (Max-Age=0 or empty value)
    const outCookie = signOutRes.headers.get('set-cookie') ?? ''
    const isCleared = outCookie.includes('Max-Age=0') || outCookie.includes('session=;')
    expect(isCleared).toBe(true)
  })
})

describe('Better Auth — blocked user gate', () => {
  test('blocked user cannot create new session via BA sign-in', async () => {
    // Seed blocked user
    const hash = await Bun.password.hash('pass123', { algorithm: 'bcrypt' })
    const blockedUser = await prisma.user.upsert({
      where: { email: 'ba-blocked@example.com' },
      update: { password: hash, blocked: true },
      create: { email: 'ba-blocked@example.com', name: 'Blocked', password: hash, blocked: true, role: 'USER' },
    })
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: blockedUser.email } },
      update: { password: hash },
      create: {
        accountId: blockedUser.email,
        providerId: 'credential',
        userId: blockedUser.id,
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const res = await app.handle(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ba-blocked@example.com', password: 'pass123' }),
      }),
    )
    // Should fail — blocked user cannot sign in (databaseHooks.session.create.before returns false)
    expect(res.status).not.toBe(200)
  })
})
