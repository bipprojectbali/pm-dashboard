import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let token = ''
let userId = ''

beforeAll(async () => {
  await cleanupTestData()
  const user = await seedTestUser('events@example.com', 'pass123', 'Events User', 'USER')
  userId = user.id
  token = await createTestSession(userId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('POST /api/events', () => {
  test('create event — golden path', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
        body: JSON.stringify({
          title: 'Meeting Senin',
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          location: 'Ruang Rapat A',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event).toBeDefined()
    expect(body.event.title).toBe('Meeting Senin')
    expect(body.event.location).toBe('Ruang Rapat A')
    expect(body.event.createdById).toBe(userId)
  })

  test('create event — tanpa title → 400', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
        body: JSON.stringify({ startsAt: new Date().toISOString() }),
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/title/)
  })

  test('create event — tanpa auth → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'test', startsAt: new Date().toISOString() }),
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /api/events', () => {
  test('list upcoming — hanya event di masa depan', async () => {
    // Buat event masa lalu
    await prisma.event.create({
      data: {
        title: 'Event Lama',
        startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        createdById: userId,
      },
    })

    const res = await app.handle(
      new Request('http://localhost/api/events?upcoming=true', {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.events)).toBe(true)
    // Event lama tidak boleh muncul
    const titles = body.events.map((e: { title: string }) => e.title)
    expect(titles).not.toContain('Event Lama')
  })

  test('list all — terurut by startsAt asc', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/events', {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const dates = body.events.map((e: { startsAt: string }) => new Date(e.startsAt).getTime())
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1])
    }
  })

  test('count reflects the true total beyond `limit`, not the page size', async () => {
    await prisma.event.deleteMany()
    // 5 events, but request limit=2 — `count` must still be 5, not 2.
    await prisma.event.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        title: `Bulk Event ${i}`,
        startsAt: new Date(Date.now() + (i + 1) * 60 * 60 * 1000),
        createdById: userId,
      })),
    })

    const res = await app.handle(
      new Request('http://localhost/api/events?limit=2', {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events.length).toBe(2)
    expect(body.count).toBe(5)
  })
})

describe('GET /api/events/badge-stats', () => {
  test('counts stay accurate beyond the 100-row list cap', async () => {
    await prisma.event.deleteMany()
    // 110 events today, 1 tomorrow — well past the old client-side 100-row cap
    // that GET /api/events?limit=100 used to be filtered over.
    const now = Date.now()
    await prisma.event.createMany({
      data: [
        ...Array.from({ length: 110 }, (_, i) => ({
          title: `Today ${i}`,
          startsAt: new Date(now + (i + 1) * 60 * 1000), // a few minutes apart, all today
          createdById: userId,
        })),
        { title: 'Tomorrow', startsAt: new Date(now + 26 * 60 * 60 * 1000), createdById: userId },
      ],
    })

    const res = await app.handle(
      new Request('http://localhost/api/events/badge-stats', { headers: { cookie: `session=${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { todayCount: number; tomorrowCount: number; total: number }
    expect(body.todayCount).toBe(110)
    expect(body.tomorrowCount).toBe(1)
    expect(body.total).toBe(111)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/events/badge-stats'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/events/:id', () => {
  test('update oleh kreator — berhasil', async () => {
    const event = await prisma.event.create({
      data: {
        title: 'Event Update Test',
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        createdById: userId,
      },
    })

    const res = await app.handle(
      new Request(`http://localhost/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
        body: JSON.stringify({ title: 'Event Sudah Diupdate', location: 'Google Meet' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.title).toBe('Event Sudah Diupdate')
    expect(body.event.location).toBe('Google Meet')
  })

  test('update oleh user lain → 403', async () => {
    const other = await seedTestUser('other@example.com', 'pass123', 'Other User')
    const otherToken = await createTestSession(other.id)

    const event = await prisma.event.create({
      data: { title: 'Event Milik User Lain', startsAt: new Date(), createdById: userId },
    })

    const res = await app.handle(
      new Request(`http://localhost/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${otherToken}` },
        body: JSON.stringify({ title: 'Coba Ubah' }),
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/events/:id', () => {
  test('delete oleh kreator — berhasil', async () => {
    const event = await prisma.event.create({
      data: { title: 'Event Akan Dihapus', startsAt: new Date(), createdById: userId },
    })

    const res = await app.handle(
      new Request(`http://localhost/api/events/${event.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const check = await prisma.event.findUnique({ where: { id: event.id } })
    expect(check).toBeNull()
  })

  test('delete event tidak ada → 404', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/events/nonexistent-id', {
        method: 'DELETE',
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})
