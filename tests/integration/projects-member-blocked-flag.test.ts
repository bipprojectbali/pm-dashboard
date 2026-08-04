import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

// GET /api/projects and GET /api/projects/:id must expose `blocked` on
// owner + members[].user so the frontend can exclude blocked users from
// active pickers (Projects "Anggota" avatar filter, task assignee selects)
// while still returning the ProjectMember row unfiltered — blocking a user
// never removes their project membership (see PUT /api/admin/users/:id/block),
// so an admin's Team-tab management list still needs to see + remove them.
const app = createTestApp()

let ownerToken = ''
let projectId = ''
let blockedMemberId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('blk-owner@example.com', 'pass123', 'Blk Owner', 'ADMIN')
  ownerToken = await createTestSession(owner.id)
  const project = await seedTestProject(owner.id, 'Blocked Member Project')
  projectId = project.id

  const member = await seedTestUser('blk-member@example.com', 'pass123', 'Blk Member', 'USER')
  blockedMemberId = member.id
  await prisma.projectMember.create({ data: { projectId, userId: member.id, role: 'MEMBER' } })
  await prisma.user.update({ where: { id: member.id }, data: { blocked: true } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/projects/:id — blocked flag on members', () => {
  test('member row is still present (membership is not removed by block)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}`, { headers: { cookie: `session=${ownerToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { project: { members: Array<{ userId: string; user: { blocked?: boolean } }> } }
    const row = body.project.members.find((m) => m.userId === blockedMemberId)
    expect(row).toBeDefined()
    expect(row?.user.blocked).toBe(true)
  })

  test('owner row reports blocked = false', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}`, { headers: { cookie: `session=${ownerToken}` } }),
    )
    const body = (await res.json()) as { project: { owner: { blocked?: boolean } } }
    expect(body.project.owner.blocked).toBe(false)
  })
})

describe('GET /api/projects — blocked flag on members (list surface)', () => {
  test('list handler also exposes blocked on members[].user', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects?scope=all`, { headers: { cookie: `session=${ownerToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      projects: Array<{ id: string; members: Array<{ userId: string; user: { blocked?: boolean } }> }>
    }
    const project = body.projects.find((p) => p.id === projectId)
    const row = project?.members.find((m) => m.userId === blockedMemberId)
    expect(row?.user.blocked).toBe(true)
  })
})
