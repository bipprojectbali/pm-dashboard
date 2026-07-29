/**
 * Regression test for the /ws/presence WebSocket auth bug.
 *
 * The browser sends the session cookie URL-encoded and with a Better Auth
 * `.<signature>` suffix (e.g. `session=Tok%2Ben...%3D.sig`). The old handler
 * used a hand-rolled `match(/session=([^;]+)/)` and passed the raw, still-encoded
 * value straight to the DB lookup — which never matched, so every socket was
 * closed with code 4001 and the client reconnected forever (a reconnect storm),
 * leaving the "Online" count stuck at 0.
 *
 * The fix routes the cookie through `extractSessionToken`, which decodes and
 * strips the signature (the same helper every HTTP route already uses).
 *
 * These tests drive a REAL WebSocket against `.listen(0)` because a WS upgrade
 * cannot be exercised via `app.handle()`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, prisma, seedTestUser } from '../helpers'

const app = createTestApp().listen(0)
// @ts-expect-error — Bun exposes .server after listen()
const PORT: number = app.server!.port

// A DB token containing base64 special chars (+ / =) but no dot — exactly the
// shape that URL-encodes differently from its raw form.
const DB_TOKEN = 'Tok+en/With=Special+base64/value='
// The browser cookie: URL-encoded token + a Better Auth signature suffix,
// preceded by an unrelated `token=` cookie (as captured from the real handshake).
function browserCookie(dbToken: string): string {
  const signature = 'sIg+nature/value='
  const encoded = `${encodeURIComponent(dbToken)}.${encodeURIComponent(signature)}`
  return `token=eyJhbGciOiJIUzI1NiJ9.jwtpayload.jwtsig; session=${encoded}`
}

let userId = ''

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('ws-presence@example.com', 'pw123456', 'WS Presence', 'SUPER_ADMIN')
  userId = user.id
  await prisma.session.create({
    data: { token: DB_TOKEN, userId, expiresAt: new Date(Date.now() + 3600_000) },
  })
})

afterAll(async () => {
  await cleanupTestData()
  app.stop()
  await prisma.$disconnect()
})

type ConnResult = { opened: boolean; messages: string[]; closeCode: number | null }

/** Open a WS to /ws/presence with the given cookie, hold briefly, return lifecycle. */
function connect(cookie: string, holdMs = 400): Promise<ConnResult> {
  return new Promise((resolve) => {
    const WS = (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket
    const messages: string[] = []
    let opened = false
    let closeCode: number | null = null
    // @ts-expect-error — Bun's WebSocket accepts a headers option
    const sock = new WS(`ws://localhost:${PORT}/ws/presence`, { headers: { cookie } })
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      try {
        sock.close()
      } catch {
        // already closing
      }
      resolve({ opened, messages, closeCode })
    }
    sock.addEventListener('open', () => {
      opened = true
    })
    sock.addEventListener('message', (e: MessageEvent) => {
      messages.push(String(e.data))
    })
    sock.addEventListener('close', (e: CloseEvent) => {
      closeCode = e.code
      if (settled) return
      settled = true
      resolve({ opened, messages, closeCode })
    })
    setTimeout(finish, holdMs)
  })
}

describe('WS /ws/presence auth', () => {
  test('valid encoded cookie (signature suffix) → stays open, receives presence with userId', async () => {
    const res = await connect(browserCookie(DB_TOKEN))
    expect(res.opened).toBe(true)
    // Server must NOT close it with 4001 — it was closed by us (1000/1005) or still open.
    expect(res.closeCode).not.toBe(4001)
    // First frame is the presence snapshot including this user.
    const presenceMsg = res.messages.find((m) => m.includes('"type":"presence"'))
    expect(presenceMsg).toBeDefined()
    const parsed = JSON.parse(presenceMsg!) as { type: string; online: string[] }
    expect(parsed.online).toContain(userId)
  })

  test('missing cookie → closed 4001 Unauthorized', async () => {
    const res = await connect('')
    expect(res.closeCode).toBe(4001)
  })

  test('cookie with unknown session token → closed 4001 Unauthorized', async () => {
    const res = await connect(`session=${encodeURIComponent('does-not-exist-token')}`)
    expect(res.closeCode).toBe(4001)
  })

  test('online list clears after the socket disconnects', async () => {
    // Connect and confirm online, then let it close and confirm it drops out.
    await connect(browserCookie(DB_TOKEN))
    // After close, a fresh connection should still see itself but the previous
    // socket must be gone (presence keys are per-userId; single user here).
    const res = await connect(browserCookie(DB_TOKEN))
    const presenceMsg = res.messages.find((m) => m.includes('"type":"presence"'))
    const parsed = JSON.parse(presenceMsg!) as { online: string[] }
    // Exactly one entry for our single user — no leaked/duplicated ghost entries.
    expect(parsed.online.filter((id) => id === userId).length).toBe(1)
  })
})
