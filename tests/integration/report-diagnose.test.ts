import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'
import { getSendHistory, recordSendHistory } from '../../src/lib/report-history'
import { redis } from '../../src/lib/redis'

const app = createTestApp()

const REPORT_KEYS = [
  'telegram.enabled', 'telegram.botToken', 'telegram.chatId',
  'ai.anthropicApiKey', 'ai.model', 'ai.baseUrl',
  'report.scheduleHour', 'report.scheduleMinute', 'report.timezone',
  'report.cooldownMinutes', 'report.lastSentAt', 'report.promptInstruction',
]

let userToken: string
let superToken: string
let savedSecret: string | undefined
const snapshotBefore = new Map<string, string>()

async function snapshotKeys() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: REPORT_KEYS } } })
  for (const r of rows) snapshotBefore.set(r.key, r.value)
}

async function restoreKeys() {
  await prisma.appSetting.deleteMany({ where: { key: { in: REPORT_KEYS } } })
  for (const [key, value] of snapshotBefore) {
    await prisma.appSetting.create({ data: { key, value } })
  }
}

async function setKey(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

async function clearKey(key: string) {
  await prisma.appSetting.deleteMany({ where: { key } })
}

beforeAll(async () => {
  savedSecret = process.env.MCP_SECRET
  process.env.MCP_SECRET = 'test-mcp-secret-fixed-value'
  await snapshotKeys()
  await cleanupTestData()
  const user = await seedTestUser('user-diag@example.com', 'x', 'U', 'USER')
  const sa = await seedTestUser('sa-diag@example.com', 'x', 'S', 'SUPER_ADMIN')
  userToken = await createTestSession(user.id)
  superToken = await createTestSession(sa.id)
})

afterAll(async () => {
  await restoreKeys()
  await cleanupTestData()
  if (savedSecret === undefined) delete process.env.MCP_SECRET
  else process.env.MCP_SECRET = savedSecret
  await prisma.$disconnect()
})

function req(init: { token?: string; bearer?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.token) headers.cookie = `session=${init.token}`
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`
  return app.handle(new Request('http://localhost/api/admin/report/diagnose', { headers }))
}

describe('GET /api/admin/report/diagnose — auth', () => {
  test('no auth → 403', async () => {
    const res = await req()
    expect(res.status).toBe(403)
  })

  test('USER session → 403', async () => {
    const res = await req({ token: userToken })
    expect(res.status).toBe(403)
  })

  test('wrong Bearer → 403', async () => {
    const res = await req({ bearer: 'wrong-secret' })
    expect(res.status).toBe(403)
  })

  test('Bearer of equal length but different value → 403 (constant-time)', async () => {
    const wrongSameLen = 'X'.repeat((process.env.MCP_SECRET ?? '').length)
    const res = await req({ bearer: wrongSameLen })
    expect(res.status).toBe(403)
  })

  test('correct Bearer → 200', async () => {
    const res = await req({ bearer: process.env.MCP_SECRET! })
    expect(res.status).toBe(200)
  })

  test('SUPER_ADMIN session → 200', async () => {
    const res = await req({ token: superToken })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/admin/report/diagnose — response shape', () => {
  test('returns expected top-level keys + correct blocker detection', async () => {
    await clearKey('telegram.enabled')
    await clearKey('ai.anthropicApiKey')
    await clearKey('telegram.botToken')
    await clearKey('telegram.chatId')

    const res = await req({ bearer: process.env.MCP_SECRET! })
    const body = await res.json() as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['ai', 'blockers', 'cooldown', 'healthy', 'now', 'schedule', 'sendInFlight', 'telegram', 'version'])

    const blockers = body.blockers as string[]
    expect(blockers).toContain('telegram.enabled !== "true"')
    expect(blockers).toContain('telegram.botToken kosong')
    expect(blockers).toContain('telegram.chatId kosong')
    expect(blockers).toContain('ai.anthropicApiKey kosong')
    expect(body.healthy).toBe(false)
  })

  test('healthy=true when everything configured + no cooldown', async () => {
    await setKey('telegram.enabled', 'true')
    await setKey('telegram.botToken', 'fake')
    await setKey('telegram.chatId', '-100')
    await setKey('ai.anthropicApiKey', 'sk-fake')
    await setKey('report.scheduleHour', '18')
    await setKey('report.scheduleMinute', '0')
    await setKey('report.timezone', 'Asia/Makassar')
    await clearKey('report.lastSentAt')

    const res = await req({ bearer: process.env.MCP_SECRET! })
    const body = await res.json() as { healthy: boolean; blockers: string[]; now: { configuredTz: string }; schedule: { parsedHour: number; parsedMinute: number; valid: boolean } }
    expect(body.healthy).toBe(true)
    expect(body.blockers).toEqual([])
    expect(body.now.configuredTz).toBe('Asia/Makassar')
    expect(body.schedule).toMatchObject({ parsedHour: 18, parsedMinute: 0, valid: true })
  })

  test('flags invalid schedule when stored value is non-numeric', async () => {
    await setKey('report.scheduleHour', 'abc')
    await setKey('report.scheduleMinute', '0')
    const res = await req({ bearer: process.env.MCP_SECRET! })
    const body = await res.json() as { schedule: { valid: boolean }; blockers: string[] }
    expect(body.schedule.valid).toBe(false)
    expect(body.blockers.some((b) => b.startsWith('schedule invalid'))).toBe(true)
  })

  test('reports active cooldown when lastSentAt recent', async () => {
    await setKey('report.scheduleHour', '18')
    await setKey('report.scheduleMinute', '0')
    await setKey('report.cooldownMinutes', '30')
    await setKey('report.lastSentAt', new Date(Date.now() - 5 * 60_000).toISOString())

    const res = await req({ bearer: process.env.MCP_SECRET! })
    const body = await res.json() as { cooldown: { active: boolean; remainingMs: number }; blockers: string[] }
    expect(body.cooldown.active).toBe(true)
    expect(body.cooldown.remainingMs).toBeGreaterThan(0)
    expect(body.blockers.some((b) => b.startsWith('cooldown aktif'))).toBe(true)
  })
})

describe('GET /api/admin/report/send-history', () => {
  beforeAll(async () => {
    await redis.del('report:send-history')
  })

  afterAll(async () => {
    await redis.del('report:send-history')
  })

  test('returns empty list initially', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/report/send-history', {
        headers: { cookie: `session=${superToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { history: unknown[] }
    expect(Array.isArray(body.history)).toBe(true)
    expect(body.history.length).toBe(0)
  })

  test('records and returns send history entries', async () => {
    await recordSendHistory({ sentAt: new Date().toISOString(), ok: true, message: 'Test OK', trigger: 'cron' })
    await recordSendHistory({ sentAt: new Date().toISOString(), ok: false, message: 'Test fail', trigger: 'manual' })

    const history = await getSendHistory()
    expect(history.length).toBe(2)
    expect(history[0].trigger).toBe('manual')
    expect(history[0].ok).toBe(false)
    expect(history[1].trigger).toBe('cron')
    expect(history[1].ok).toBe(true)
  })

  test('endpoint returns 403 for unauthenticated', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/report/send-history'),
    )
    expect(res.status).toBe(403)
  })
})
