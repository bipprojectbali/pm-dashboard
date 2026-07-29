import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

// GET /api/projects must hide archived projects by default (same convention as
// admin-overview aggregates and MCP project tools), and expose them only via
// ?includeArchived=true. Regression: the admin + non-admin branches previously
// returned archived rows, so the Admin Projects tab / KPI cards double-counted
// them vs the overview widgets that filter archivedAt.
const app = createTestApp()

let adminToken = ''
let memberToken = ''
let activeProjectId = ''
let archivedProjectId = ''

async function listProjects(token: string, qs = '') {
  const res = await app.handle(
    new Request(`http://localhost/api/projects${qs}`, {
      headers: { cookie: `session=${token}` },
    }),
  )
  const body = (await res.json()) as { projects: Array<{ id: string; archivedAt: string | null }> }
  return { status: res.status, ids: body.projects.map((p) => p.id) }
}

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('arch-admin@example.com', 'pass123', 'Arch Admin', 'ADMIN')
  adminToken = await createTestSession(admin.id)

  // A regular member who owns both projects (so they show up in scope=mine too).
  const member = await seedTestUser('arch-member@example.com', 'pass123', 'Arch Member', 'USER')
  memberToken = await createTestSession(member.id)

  activeProjectId = (await seedTestProject(member.id, 'Active Project')).id
  archivedProjectId = (await seedTestProject(member.id, 'Archived Project')).id
  await prisma.project.update({ where: { id: archivedProjectId }, data: { archivedAt: new Date() } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/projects — archived visibility', () => {
  test('admin default list hides archived projects', async () => {
    const { status, ids } = await listProjects(adminToken)
    expect(status).toBe(200)
    expect(ids).toContain(activeProjectId)
    expect(ids).not.toContain(archivedProjectId)
  })

  test('admin ?includeArchived=true returns archived projects', async () => {
    const { status, ids } = await listProjects(adminToken, '?includeArchived=true')
    expect(status).toBe(200)
    expect(ids).toContain(activeProjectId)
    expect(ids).toContain(archivedProjectId)
  })

  test('member visible-scope list hides archived projects', async () => {
    const { ids } = await listProjects(memberToken)
    expect(ids).toContain(activeProjectId)
    expect(ids).not.toContain(archivedProjectId)
  })

  test('scope=mine hides archived by default, shows with includeArchived', async () => {
    const mine = await listProjects(memberToken, '?scope=mine')
    expect(mine.ids).toContain(activeProjectId)
    expect(mine.ids).not.toContain(archivedProjectId)

    const mineWithArchived = await listProjects(memberToken, '?scope=mine&includeArchived=true')
    expect(mineWithArchived.ids).toContain(archivedProjectId)
  })

  test('opening an archived project by id still works (detail not gated by archive)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${archivedProjectId}`, {
        headers: { cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { project: { id: string } }
    expect(body.project.id).toBe(archivedProjectId)
  })
})
