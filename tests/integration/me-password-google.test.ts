import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Covers the "set first password" path for Google-only accounts (password === '')
// vs the "change password" path for accounts that already have one, plus the
// hasPassword flag surfaced by GET /api/auth/session.
const app = createTestApp()

let googleToken = ''
let googleUserId = ''
let pwdToken = ''

beforeAll(async () => {
  await cleanupTestData()
  // Google-only account: created via OAuth path → password stored as '' (default).
  const google = await prisma.user.create({
    data: { email: 'google-only@example.com', name: 'Google User', password: '', role: 'USER' },
  })
  googleUserId = google.id
  googleToken = await createTestSession(googleUserId)

  // Normal email/password account (seedTestUser hashes the password).
  const pwdUser = await seedTestUser('has-password@example.com', 'origpass1', 'Pwd User', 'USER')
  pwdToken = await createTestSession(pwdUser.id)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

function session(token: string) {
  return app.handle(new Request('http://localhost/api/auth/session', { headers: { cookie: `session=${token}` } }))
}
function setPassword(token: string, payload: Record<string, unknown>) {
  return app.handle(
    new Request('http://localhost/api/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(payload),
    }),
  )
}

describe('GET /api/auth/session — hasPassword flag', () => {
  test('Google-only account reports hasPassword=false and never leaks the hash', async () => {
    const res = await session(googleToken)
    expect(res.status).toBe(200)
    const { user } = await res.json()
    expect(user.hasPassword).toBe(false)
    expect(user.password).toBeUndefined()
  })

  test('email/password account reports hasPassword=true', async () => {
    const { user } = await (await session(pwdToken)).json()
    expect(user.hasPassword).toBe(true)
    expect(user.password).toBeUndefined()
  })
})

describe('PUT /api/me/password — set first password (Google account)', () => {
  test('sets password without currentPassword and audits PASSWORD_CREATED', async () => {
    const res = await setPassword(googleToken, { newPassword: 'brandnew123' })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    // Password is now set → verifiable, and session flips to hasPassword=true.
    const updated = await prisma.user.findUnique({ where: { id: googleUserId } })
    expect(await Bun.password.verify('brandnew123', updated!.password)).toBe(true)
    const { user } = await (await session(googleToken)).json()
    expect(user.hasPassword).toBe(true)

    const audit = await prisma.auditLog.findFirst({
      where: { userId: googleUserId, action: 'PASSWORD_CREATED' },
    })
    expect(audit).not.toBeNull()
  })

  test('rejects too-short password (<8) with 400', async () => {
    const other = await prisma.user.create({
      data: { email: 'google-short@example.com', name: 'Short', password: '', role: 'USER' },
    })
    const token = await createTestSession(other.id)
    const res = await setPassword(token, { newPassword: 'short' })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/me/password — change password (existing password)', () => {
  test('still requires a correct currentPassword', async () => {
    const wrong = await setPassword(pwdToken, { currentPassword: 'nope', newPassword: 'changed123' })
    expect(wrong.status).toBe(403)

    const missing = await setPassword(pwdToken, { newPassword: 'changed123' })
    expect(missing.status).toBe(400)

    const ok = await setPassword(pwdToken, { currentPassword: 'origpass1', newPassword: 'changed123' })
    expect(ok.status).toBe(200)
  })
})
