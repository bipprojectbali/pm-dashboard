import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// GET /api/tasks/dashboard-charts — Throughput/Status breakdown/Top assignees
// counted directly in the DB so they stay correct beyond the /api/tasks
// 200-row cap. Before this endpoint, the Tasks panel dashboard overlay derived
// these three charts client-side from a capped fetch, silently under-counting
// once a project passed ~200 tasks (same bug class already fixed for the
// Total/Open/Closed/Overdue stat cards via GET /api/tasks/dashboard-stats).
const app = createTestApp()

let ownerId = ''
let ownerToken = ''
let assigneeId = ''
let projectId = ''

function dayStr(offsetDays: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}

beforeAll(async () => {
  await cleanupTestData()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()

  const owner = await seedTestUser('dash-charts-owner@example.com', 'x', 'Owner', 'ADMIN')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)
  const assignee = await seedTestUser('dash-charts-assignee@example.com', 'x', 'Assignee', 'USER')
  assigneeId = assignee.id

  const project = await prisma.project.create({
    data: {
      name: 'Dashboard Charts Project',
      description: 'd',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: ownerId, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId, userId: assigneeId, role: 'MEMBER' } })

  // 209 tasks total — well past the /api/tasks 200-row cap — split across
  // status/assignee/day so a client-side chart over a capped 200-row fetch
  // would visibly disagree with these totals.
  // 9 open tasks assigned to `assignee` (all created "today", within trend window).
  const openRows = Array.from({ length: 9 }, (_, i) => ({
    projectId,
    reporterId: ownerId,
    assigneeId,
    kind: 'TASK' as const,
    status: 'OPEN' as const,
    title: `Open ${i}`,
    description: 'd',
    priority: 'MEDIUM' as const,
    createdAt: dayStr(0),
  }))
  // 200 closed tasks, all closed 3 days ago (outside the default 14-day trend
  // window's "today" bucket but within range), created 20 days ago (outside
  // the 14-day trend window entirely) so throughput counts stay small and
  // assertable while statusBreakdown still sees all 200.
  const closedRows = Array.from({ length: 200 }, (_, i) => ({
    projectId,
    reporterId: ownerId,
    kind: 'TASK' as const,
    status: 'CLOSED' as const,
    title: `Closed ${i}`,
    description: 'd',
    priority: 'MEDIUM' as const,
    createdAt: dayStr(-20),
    closedAt: dayStr(-3),
  }))
  await prisma.task.createMany({ data: [...openRows, ...closedRows] })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function charts(qs: string, token = ownerToken) {
  return app.handle(
    new Request(`http://localhost/api/tasks/dashboard-charts?${qs}`, { headers: { cookie: `session=${token}` } }),
  )
}

type ChartsBody = {
  throughput: Array<{ date: string; created: number; closed: number }>
  statusBreakdown: Record<string, number>
  topAssignees: Array<{ id: string; name: string; count: number }>
}

describe('GET /api/tasks/dashboard-charts', () => {
  test('statusBreakdown sums to all 209 tasks, not capped at 200', async () => {
    const res = await charts(`projectId=${projectId}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as ChartsBody
    const sum = Object.values(body.statusBreakdown).reduce((a, b) => a + b, 0)
    expect(sum).toBe(209)
    expect(body.statusBreakdown.OPEN).toBe(9)
    expect(body.statusBreakdown.CLOSED).toBe(200)
  })

  test('topAssignees counts all 9 open tasks for the assignee (not just what a 200-cap would show)', async () => {
    const res = await charts(`projectId=${projectId}`)
    const body = (await res.json()) as ChartsBody
    const entry = body.topAssignees.find((a) => a.id === assigneeId)
    expect(entry).toBeDefined()
    expect(entry?.count).toBe(9)
    expect(entry?.name).toBe('Assignee')
  })

  test('throughput bucket for "today" reflects the 9 created tasks', async () => {
    const res = await charts(`projectId=${projectId}`)
    const body = (await res.json()) as ChartsBody
    const todayKey = dayStr(0).toISOString().slice(0, 10)
    const bucket = body.throughput.find((b) => b.date === todayKey)
    expect(bucket).toBeDefined()
    expect(bucket?.created).toBe(9)
  })

  test('throughput has trendDays entries (default 14)', async () => {
    const res = await charts(`projectId=${projectId}`)
    const body = (await res.json()) as ChartsBody
    expect(body.throughput.length).toBe(14)
  })

  test('unauthenticated → 401', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tasks/dashboard-charts?projectId=${projectId}`))
    expect(res.status).toBe(401)
  })

  test('non-member on a private project → 403', async () => {
    const outsider = await seedTestUser('dash-charts-outsider@example.com', 'x', 'O', 'USER')
    const outsiderToken = await createTestSession(outsider.id)
    const res = await charts(`projectId=${projectId}`, outsiderToken)
    expect(res.status).toBe(403)
  })
})
