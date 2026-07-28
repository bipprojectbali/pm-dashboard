import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

// Locks the fix behind the Settings → Profil "Proyek yang saya ikuti" card:
// GET /api/projects?scope=mine must return ONLY projects the caller is a member
// of, even for an admin — whereas the default admin scope returns every project.
const app = createTestApp()

let adminToken = ''
let ownedProjectId = ''
let foreignProjectId = ''

beforeAll(async () => {
  await cleanupTestData()
  // Admin who owns project A (auto-added as OWNER member by seedTestProject).
  const admin = await seedTestUser('scope-admin@example.com', 'pass123', 'Scope Admin', 'ADMIN')
  adminToken = await createTestSession(admin.id)
  ownedProjectId = (await seedTestProject(admin.id, 'Admin Owned Project')).id

  // A different user owns project B (PRIVATE). The admin is NOT a member of it.
  const other = await seedTestUser('scope-other@example.com', 'pass123', 'Scope Other', 'USER')
  foreignProjectId = (await seedTestProject(other.id, 'Foreign Private Project')).id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

function list(scope?: string) {
  const qs = scope ? `?scope=${scope}` : ''
  return app.handle(
    new Request(`http://localhost/api/projects${qs}`, { headers: { cookie: `session=${adminToken}` } }),
  )
}

describe('GET /api/projects?scope=mine', () => {
  test('admin default scope sees the foreign project (all projects)', async () => {
    const res = await list()
    expect(res.status).toBe(200)
    const ids = (await res.json()).projects.map((p: { id: string }) => p.id)
    expect(ids).toContain(ownedProjectId)
    expect(ids).toContain(foreignProjectId) // admin default = every project
  })

  test('scope=mine returns only membership projects, excluding the foreign one', async () => {
    const res = await list('mine')
    expect(res.status).toBe(200)
    const projects = (await res.json()).projects as { id: string; myRole: string | null }[]
    const ids = projects.map((p) => p.id)
    expect(ids).toContain(ownedProjectId)
    expect(ids).not.toContain(foreignProjectId)
    // Every project in scope=mine carries the caller's role (never null).
    expect(projects.every((p) => p.myRole != null)).toBe(true)
    expect(projects.find((p) => p.id === ownedProjectId)?.myRole).toBe('OWNER')
  })
})
