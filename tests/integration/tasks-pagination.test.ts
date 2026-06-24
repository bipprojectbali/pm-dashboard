import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  cleanupTestData,
  createTestApp,
  createTestSession,
  prisma,
  seedTestProject,
  seedTestTask,
  seedTestUser,
} from '../helpers'

const app = createTestApp()

let token = ''
let userId = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()

  const user = await seedTestUser('pagination@example.com', 'pass123', 'Paging User', 'ADMIN')
  userId = user.id
  token = await createTestSession(userId)

  const project = await seedTestProject(userId, 'Pagination Test Project')
  projectId = project.id

  // Seed 30 tasks: 20 OPEN, 5 IN_PROGRESS, 5 CLOSED
  // Mix of priorities and assignees
  const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  for (let i = 1; i <= 20; i++) {
    await seedTestTask(projectId, userId, {
      title: `Open Task ${i}`,
      status: 'OPEN',
      priority: i % 4 === 0 ? 'CRITICAL' : i % 3 === 0 ? 'HIGH' : i % 2 === 0 ? 'MEDIUM' : 'LOW',
      // 5 tasks overdue, 5 with no due date, 10 with future due
      dueAt: i <= 5 ? pastDate : i <= 10 ? null : futureDate,
      // 10 unassigned, 10 assigned to self
      assigneeId: i > 10 ? userId : null,
    })
  }
  for (let i = 1; i <= 5; i++) {
    await seedTestTask(projectId, userId, {
      title: `In Progress Task ${i}`,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueAt: futureDate,
      assigneeId: userId,
    })
  }
  for (let i = 1; i <= 5; i++) {
    await seedTestTask(projectId, userId, {
      title: `Closed Task ${i}`,
      status: 'CLOSED',
      priority: 'LOW',
    })
  }
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/tasks — pagination', () => {
  test('no filter returns paginated response with total', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=10&offset=0`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toHaveLength(10)
    expect(body.total).toBe(30)
    expect(body.limit).toBe(10)
    expect(body.offset).toBe(0)
  })

  test('offset 10 returns second page', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=10&offset=10`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toHaveLength(10)
    expect(body.total).toBe(30)
    expect(body.offset).toBe(10)
  })

  test('offset 20 returns third page (last 10)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=10&offset=20`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toHaveLength(10)
    expect(body.total).toBe(30)
  })

  test('first and second pages return different task IDs', async () => {
    const r1 = await app
      .handle(
        new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=10&offset=0`, {
          headers: { cookie: `session=${token}` },
        }),
      )
      .then((r) => r.json())
    const r2 = await app
      .handle(
        new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=10&offset=10`, {
          headers: { cookie: `session=${token}` },
        }),
      )
      .then((r) => r.json())
    const ids1 = new Set(r1.tasks.map((t: { id: string }) => t.id))
    const ids2 = r2.tasks.map((t: { id: string }) => t.id)
    for (const id of ids2) expect(ids1.has(id)).toBe(false)
  })
})

describe('GET /api/tasks — status filter', () => {
  test('status=OPEN returns only open tasks', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&status=OPEN&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(20)
    for (const t of body.tasks) expect(t.status).toBe('OPEN')
  })

  test('status=CLOSED returns only closed tasks', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&status=CLOSED&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(5)
    for (const t of body.tasks) expect(t.status).toBe('CLOSED')
  })
})

describe('GET /api/tasks — search filter', () => {
  test('search matches title substring', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/tasks?projectId=${projectId}&search=Open+Task+1&limit=50`,
        { headers: { cookie: `session=${token}` } },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // "Open Task 1", "Open Task 10"-"Open Task 19" match "Open Task 1"
    expect(body.total).toBeGreaterThanOrEqual(1)
    for (const t of body.tasks) {
      expect(t.title.toLowerCase()).toContain('open task 1')
    }
  })

  test('search with no match returns empty results', async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/tasks?projectId=${projectId}&search=xyznonexistentabc&limit=50`,
        { headers: { cookie: `session=${token}` } },
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.tasks).toHaveLength(0)
  })
})

describe('GET /api/tasks — priority filter', () => {
  test('priority=CRITICAL returns only critical tasks', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&priority=CRITICAL&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    for (const t of body.tasks) expect(t.priority).toBe('CRITICAL')
  })

  test('invalid priority returns 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&priority=BOGUS`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('GET /api/tasks — quick filters', () => {
  test('overdueOnly=1 returns only non-closed tasks with dueAt in the past', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&overdueOnly=1&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // 5 open tasks seeded with past dueAt
    expect(body.total).toBe(5)
    const now = Date.now()
    for (const t of body.tasks) {
      expect(t.status).not.toBe('CLOSED')
      expect(new Date(t.dueAt).getTime()).toBeLessThan(now)
    }
  })

  test('unassigned=1 returns only tasks without assignee', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&unassigned=1&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // 10 open tasks + 5 closed tasks seeded with no assignee
    expect(body.total).toBe(15)
    for (const t of body.tasks) expect(t.assignee).toBeNull()
  })

  test('noDue=1 returns only tasks without dueAt', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&noDue=1&limit=50`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // 5 open tasks + 5 closed tasks seeded with no dueAt = 10 (closed tasks have no dueAt too)
    expect(body.total).toBeGreaterThanOrEqual(5)
    for (const t of body.tasks) expect(t.dueAt).toBeNull()
  })
})

describe('GET /api/tasks — total field accuracy', () => {
  test('total matches full count regardless of limit', async () => {
    const r1 = await app
      .handle(
        new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=5&offset=0`, {
          headers: { cookie: `session=${token}` },
        }),
      )
      .then((r) => r.json())
    const r2 = await app
      .handle(
        new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=50&offset=0`, {
          headers: { cookie: `session=${token}` },
        }),
      )
      .then((r) => r.json())

    // Both should report total=30 even though limit differs
    expect(r1.total).toBe(30)
    expect(r2.total).toBe(30)
    expect(r1.tasks).toHaveLength(5)
    expect(r2.tasks).toHaveLength(30)
  })

  test('limit is capped at 200', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&limit=9999`, {
        headers: { cookie: `session=${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.limit).toBeLessThanOrEqual(200)
  })
})

describe('GET /api/tasks — auth', () => {
  test('unauthenticated request returns 401', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}`),
    )
    expect(res.status).toBe(401)
  })
})
