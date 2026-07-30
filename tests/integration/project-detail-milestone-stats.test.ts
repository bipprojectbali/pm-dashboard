import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

// GET /api/projects/:id must return milestoneStats.done (completed milestones),
// not only total. The detail handler used to omit milestoneStats entirely, so
// the Overview card always showed 0/N even when milestones were completed —
// inconsistent with the list handler which set it correctly.
const app = createTestApp()

let token = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('ms-owner@example.com', 'pass123', 'MS Owner', 'ADMIN')
  token = await createTestSession(owner.id)
  projectId = (await seedTestProject(owner.id, 'Milestone Project')).id

  await prisma.projectMilestone.createMany({
    data: [
      { projectId, title: 'Done A', completedAt: new Date() },
      { projectId, title: 'Done B', completedAt: new Date() },
      { projectId, title: 'Pending C', completedAt: null },
    ],
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/projects/:id — milestoneStats', () => {
  test('returns done = completed count and total = all milestones', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}`, { headers: { cookie: `session=${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { project: { milestoneStats?: { done: number; total: number } } }
    expect(body.project.milestoneStats).toBeDefined()
    expect(body.project.milestoneStats?.done).toBe(2) // Done A + Done B
    expect(body.project.milestoneStats?.total).toBe(3)
  })

  test('detail milestoneStats matches the list handler for the same project', async () => {
    const detailRes = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}`, { headers: { cookie: `session=${token}` } }),
    )
    const detail = (await detailRes.json()) as { project: { milestoneStats?: { done: number; total: number } } }

    const listRes = await app.handle(
      new Request(`http://localhost/api/projects?scope=all`, { headers: { cookie: `session=${token}` } }),
    )
    const list = (await listRes.json()) as {
      projects: Array<{ id: string; milestoneStats?: { done: number; total: number } }>
    }
    const fromList = list.projects.find((p) => p.id === projectId)

    // The same project must report the same milestone-done count on both surfaces.
    expect(detail.project.milestoneStats?.done).toBe(fromList?.milestoneStats?.done ?? -1)
  })
})
