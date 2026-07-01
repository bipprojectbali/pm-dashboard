import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let adminToken = ''
let userToken = ''

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('admin-rh@example.com', 'pass123', 'Admin RH', 'SUPER_ADMIN')
  adminToken = await createTestSession(admin.id)
  const user = await seedTestUser('user-rh@example.com', 'pass123', 'User RH', 'ADMIN')
  userToken = await createTestSession(user.id)

  // Seed beberapa entri — pakai tanggal relatif (bukan hardcoded) supaya selalu
  // masuk window range=1m (30 hari terakhir), tak basi seiring waktu.
  const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000)
  await prisma.reportHistory.createMany({
    data: [
      { sentAt: daysAgo(3), ok: true, message: 'OK', trigger: 'cron', markdown: '# Laporan 1\nIsi laporan.' },
      { sentAt: daysAgo(2), ok: true, message: 'OK', trigger: 'manual', markdown: '# Laporan 2\nIsi laporan.' },
      { sentAt: daysAgo(1), ok: false, message: 'Telegram error', trigger: 'cron' },
    ],
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/admin/report/send-history', () => {
  test('returns entries dengan pagination default', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/report/send-history', {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.history)).toBe(true)
    expect(body.total).toBeGreaterThanOrEqual(3)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  test('filter range=1m hanya mengembalikan entri dalam 30 hari', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/report/send-history?range=1m', {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    const body = await res.json()
    expect(body.range).toBe('1m')
    expect(body.total).toBeGreaterThanOrEqual(3)
  })

  test('urutan descending by sentAt', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/admin/report/send-history?range=all', {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    const body = await res.json()
    const entries = body.history as Array<{ sentAt: string }>
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i - 1].sentAt).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[i].sentAt).getTime(),
      )
    }
  })

  test('tanpa auth → 403', async () => {
    const res = await app.handle(new Request('http://localhost/api/admin/report/send-history'))
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/admin/report/history/:id', () => {
  test('SUPER_ADMIN bisa hapus entri', async () => {
    const entry = await prisma.reportHistory.create({
      data: { sentAt: new Date(), ok: true, message: 'test', trigger: 'manual' },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/admin/report/history/${entry.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(await prisma.reportHistory.findUnique({ where: { id: entry.id } })).toBeNull()
  })

  test('ADMIN biasa → 403', async () => {
    const entry = await prisma.reportHistory.create({
      data: { sentAt: new Date(), ok: true, message: 'test', trigger: 'cron' },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/admin/report/history/${entry.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${userToken}` },
      }),
    )
    expect(res.status).toBe(403)
  })
})
