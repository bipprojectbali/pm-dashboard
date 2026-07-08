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
let ownerId = ''
let memberId = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('assignee-owner@example.com', 'pass123', 'Owner User', 'ADMIN')
  ownerId = owner.id
  token = await createTestSession(ownerId)

  const member = await seedTestUser('assignee-member@example.com', 'pass123', 'Member User', 'USER')
  memberId = member.id

  const project = await seedTestProject(ownerId, 'Assignee Filter Project')
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: memberId, role: 'MEMBER' } })

  // 3 assigned to owner, 2 assigned to member, 4 unassigned
  for (let i = 0; i < 3; i++) await seedTestTask(projectId, ownerId, { title: `Owner ${i}`, assigneeId: ownerId })
  for (let i = 0; i < 2; i++) await seedTestTask(projectId, ownerId, { title: `Member ${i}`, assigneeId: memberId })
  for (let i = 0; i < 4; i++) await seedTestTask(projectId, ownerId, { title: `Unassigned ${i}`, assigneeId: null })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const get = (qs: string) =>
  app.handle(new Request(`http://localhost/api/tasks?${qs}`, { headers: { cookie: `session=${token}` } }))

describe('GET /api/tasks — assigneeId filter', () => {
  test('assigneeId returns only that user\'s tasks (golden path)', async () => {
    const res = await get(`projectId=${projectId}&assigneeId=${memberId}&limit=50`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    for (const t of body.tasks) expect(t.assignee?.id).toBe(memberId)
  })

  test('assigneeId for owner returns the owner\'s tasks', async () => {
    const body = await get(`projectId=${projectId}&assigneeId=${ownerId}&limit=50`).then((r) => r.json())
    expect(body.total).toBe(3)
    for (const t of body.tasks) expect(t.assignee?.id).toBe(ownerId)
  })

  test('assigneeId of a user with no tasks here returns empty (edge)', async () => {
    // A valid user id that was never assigned any task in this project.
    const ghost = await seedTestUser('assignee-ghost@example.com', 'pass123', 'Ghost User', 'USER')
    const body = await get(`projectId=${projectId}&assigneeId=${ghost.id}&limit=50`).then((r) => r.json())
    expect(body.total).toBe(0)
    expect(body.tasks).toHaveLength(0)
  })

  test('unassigned=1 returns only tasks without an assignee (edge)', async () => {
    const body = await get(`projectId=${projectId}&unassigned=1&limit=50`).then((r) => r.json())
    expect(body.total).toBe(4)
    for (const t of body.tasks) expect(t.assignee).toBeNull()
  })

  test('assigneeId + unassigned are mutually exclusive filters over the same set', async () => {
    // Sanity: assigned + unassigned counts add up to the full project total.
    const all = await get(`projectId=${projectId}&limit=50`).then((r) => r.json())
    const owner = await get(`projectId=${projectId}&assigneeId=${ownerId}&limit=50`).then((r) => r.json())
    const member = await get(`projectId=${projectId}&assigneeId=${memberId}&limit=50`).then((r) => r.json())
    const unassigned = await get(`projectId=${projectId}&unassigned=1&limit=50`).then((r) => r.json())
    expect(owner.total + member.total + unassigned.total).toBe(all.total)
  })
})
