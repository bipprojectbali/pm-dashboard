/**
 * Signup allowlist gate — the only thing standing between an unauthenticated
 * request and a `User` row.
 *
 * What is covered end-to-end here is the email/password door
 * (`POST /api/auth/sign-up/email`). The Google OAuth door cannot be driven from
 * a test — it needs a real authorization code from Google's token endpoint — so
 * it is covered by calling the hook function directly in the last describe
 * block. Both doors reach the same `databaseHooks.user.create.before`, via
 * `internalAdapter.createUser` and `internalAdapter.createOAuthUser`
 * respectively, so exercising the hook is exercising the OAuth gate.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { authDatabaseHooks } from '../../src/lib/auth.hooks'
import { env } from '../../src/lib/env'
import {
  resolveSignupDecision,
  SIGNUP_ALLOWLIST_SETTING_KEY,
  SIGNUP_CLOSED_MESSAGE,
} from '../../src/lib/signup-allowlist'
import { cleanupTestData, createTestApp, prisma } from '../helpers'

const app = createTestApp()

const CANDIDATE = 'newhire@wibudev.com'
const PASSWORD = 'password123'

function signUp(email: string) {
  return app.handle(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Hire', email, password: PASSWORD }),
    }),
  )
}

async function setAllowlist(value: string) {
  await prisma.appSetting.upsert({
    where: { key: SIGNUP_ALLOWLIST_SETTING_KEY },
    update: { value },
    create: { key: SIGNUP_ALLOWLIST_SETTING_KEY, value },
  })
}

async function clearAllowlist() {
  await prisma.appSetting.deleteMany({ where: { key: SIGNUP_ALLOWLIST_SETTING_KEY } })
}

/** wipeAll() in helpers does not touch account/appSetting rows — clean ours up. */
async function wipeSignupRows() {
  await prisma.account.deleteMany()
  await clearAllowlist()
  await cleanupTestData()
}

beforeAll(async () => {
  await wipeSignupRows()
})

beforeEach(async () => {
  await wipeSignupRows()
})

afterAll(async () => {
  await wipeSignupRows()
  await prisma.$disconnect()
})

describe('POST /api/auth/sign-up/email — closed by default', () => {
  test('absent allowlist setting rejects with 403 and creates no User row', async () => {
    const before = await prisma.user.count()

    const res = await signUp(CANDIDATE)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toBe(SIGNUP_CLOSED_MESSAGE)

    expect(await prisma.user.count()).toBe(before)
    expect(await prisma.user.findUnique({ where: { email: CANDIDATE } })).toBeNull()
    // The aborted insert must not leave a credential row behind either.
    expect(await prisma.account.count()).toBe(0)
  })

  test('empty allowlist value also rejects — fail closed, not fail open', async () => {
    await setAllowlist('   \n , \n ')

    const res = await signUp(CANDIDATE)

    expect(res.status).toBe(403)
    expect(await prisma.user.count()).toBe(0)
  })

  test('populated allowlist still rejects an address not on it', async () => {
    await setAllowlist('someone.else@wibudev.com\nanother@wibudev.com')

    const res = await signUp(CANDIDATE)

    expect(res.status).toBe(403)
    const body = await res.json()
    // Same message as the "list is empty" case — no hint about why it failed.
    expect(body.message).toBe(SIGNUP_CLOSED_MESSAGE)
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('POST /api/auth/sign-up/email — opened per person', () => {
  test('the same email succeeds once added to the allowlist', async () => {
    await setAllowlist(`someone.else@wibudev.com\n${CANDIDATE}`)

    const res = await signUp(CANDIDATE)

    expect(res.status).toBe(200)
    const created = await prisma.user.findUnique({ where: { email: CANDIDATE } })
    expect(created).not.toBeNull()
    expect(created?.role).toBe('USER')
    expect(created?.blocked).toBe(false)
  })

  test('matching is case-insensitive — a list entry in other casing still admits', async () => {
    await setAllowlist('  NewHire@WibuDev.com  ')

    const res = await signUp(CANDIDATE)

    expect(res.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { email: CANDIDATE } })).not.toBeNull()
  })
})

describe('POST /api/auth/sign-up/email — SUPER_ADMIN_EMAILS bootstrap carve-out', () => {
  const BOOTSTRAP = 'bootstrap-owner@wibudev.com'

  test('a super-admin email succeeds with an empty allowlist', async () => {
    // env.SUPER_ADMIN_EMAILS is read from process.env once at module load, so
    // the only way to drive the real HTTP path through the real carve-out is to
    // append to that array and restore it afterwards. Nothing is mocked: the
    // request, the hook, and the DB write are all the production ones.
    const list = env.SUPER_ADMIN_EMAILS as unknown as string[]
    const originalLength = list.length
    list.push(BOOTSTRAP)
    try {
      await clearAllowlist()

      const res = await signUp(BOOTSTRAP)

      expect(res.status).toBe(200)
      expect(await prisma.user.findUnique({ where: { email: BOOTSTRAP } })).not.toBeNull()
    } finally {
      list.length = originalLength
    }
  })

  test('without the carve-out that same email is rejected again', async () => {
    const res = await signUp(BOOTSTRAP)

    expect(res.status).toBe(403)
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('user.create.before hook — the OAuth door', () => {
  // Google OAuth sign-up cannot be driven end-to-end (it needs a real
  // authorization code), so the shared chokepoint is asserted directly here.
  const before = authDatabaseHooks.user.create.before

  test('throws a 403 APIError for an address not on the list', async () => {
    await clearAllowlist()

    let caught: unknown
    try {
      await before({ email: 'oauth-intruder@gmail.com' })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeDefined()
    const err = caught as { statusCode?: number; status?: string; body?: { message?: string } }
    expect(err.statusCode).toBe(403)
    expect(err.status).toBe('FORBIDDEN')
    expect(err.body?.message).toBe(SIGNUP_CLOSED_MESSAGE)
  })

  test('resolves without throwing for an allowlisted address', async () => {
    await setAllowlist('oauth-newhire@wibudev.com')

    expect(await before({ email: 'OAuth-NewHire@WibuDev.com' })).toBeUndefined()
  })

  test('resolveSignupDecision reports the reason the MCP tool surfaces', async () => {
    await setAllowlist('a@wibudev.com, b@wibudev.com')

    expect(await resolveSignupDecision('b@wibudev.com')).toEqual({
      allowed: true,
      reason: 'allowlist',
      entryCount: 2,
    })
    expect(await resolveSignupDecision('c@wibudev.com')).toEqual({
      allowed: false,
      reason: 'closed',
      entryCount: 2,
    })
  })
})
