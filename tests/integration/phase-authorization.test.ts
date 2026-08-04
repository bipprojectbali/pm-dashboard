import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Phase authorization (src/lib/phase-access.ts):
//   create: project OWNER / PM, or SUPER_ADMIN
//   modify (update+delete): OWNER, SUPER_ADMIN, or a PM (any PM for legacy
//   phases with createdById=null; only the creator PM for phases with a
//   recorded creator)
//   plain ADMIN gets NO system bypass — only via project membership
const app = createTestApp()

let projectId = ''
const tokens: Record<string, string> = {}
const userIds: Record<string, string> = {}

async function seedMember(key: string, role: 'OWNER' | 'PM' | 'MEMBER', systemRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER') {
  const u = await seedTestUser(`phaseauth-${key}@example.com`, 'x', key, systemRole)
  userIds[key] = u.id
  tokens[key] = await createTestSession(u.id)
  await prisma.projectMember.create({ data: { projectId, userId: u.id, role } })
  return u
}

beforeAll(async () => {
  await cleanupTestData()
  await prisma.projectPhase.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()

  const owner = await seedTestUser('phaseauth-owner@example.com', 'x', 'owner', 'USER')
  userIds.owner = owner.id
  tokens.owner = await createTestSession(owner.id)
  const project = await prisma.project.create({
    data: { name: 'Phase authz', description: 'd', ownerId: owner.id, status: 'ACTIVE', priority: 'HIGH', visibility: 'PRIVATE' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: owner.id, role: 'OWNER' } })

  await seedMember('pmA', 'PM')
  await seedMember('pmB', 'PM')
  await seedMember('member', 'MEMBER')

  // SUPER_ADMIN + plain ADMIN, both NON-members of the project
  const sa = await seedTestUser('phaseauth-sa@example.com', 'x', 'sa', 'SUPER_ADMIN')
  userIds.superadmin = sa.id
  tokens.superadmin = await createTestSession(sa.id)
  const ad = await seedTestUser('phaseauth-admin@example.com', 'x', 'ad', 'ADMIN')
  userIds.admin = ad.id
  tokens.admin = await createTestSession(ad.id)
})

afterAll(async () => {
  await prisma.projectPhase.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

function createPhase(token: string, title: string) {
  return app.handle(
    new Request(`http://localhost/api/projects/${projectId}/phases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ title }),
    }),
  )
}
function patchPhase(token: string, phaseId: string, body: object) {
  return app.handle(
    new Request(`http://localhost/api/phases/${phaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )
}
function deletePhase(token: string, phaseId: string) {
  return app.handle(
    new Request(`http://localhost/api/phases/${phaseId}`, { method: 'DELETE', headers: { cookie: `session=${token}` } }),
  )
}

describe('phase create authorization', () => {
  test('OWNER, PM, SUPER_ADMIN can create; MEMBER and non-member ADMIN cannot', async () => {
    expect((await createPhase(tokens.owner, 'c-owner')).status).toBe(200)
    expect((await createPhase(tokens.pmA, 'c-pmA')).status).toBe(200)
    expect((await createPhase(tokens.superadmin, 'c-sa')).status).toBe(200)
    expect((await createPhase(tokens.member, 'c-member')).status).toBe(403)
    expect((await createPhase(tokens.admin, 'c-admin')).status).toBe(403) // ADMIN not a member → no bypass
  })

  test('createdById is stamped with the creator', async () => {
    const res = await createPhase(tokens.pmA, 'c-stamp')
    const { phase } = (await res.json()) as { phase: { id: string; createdById: string } }
    expect(phase.createdById).toBe(userIds.pmA)
  })
})

describe('phase modify authorization (update + delete)', () => {
  let phaseByPmA = ''
  let oldPhase = ''

  test('setup: PM-A creates a phase; seed a legacy phase with null creator', async () => {
    const res = await createPhase(tokens.pmA, 'm-pmA')
    phaseByPmA = ((await res.json()) as { phase: { id: string } }).phase.id
    const legacy = await prisma.projectPhase.create({
      data: { projectId, title: 'm-legacy', createdById: null },
    })
    oldPhase = legacy.id
  })

  test('PM-A can update/delete their own phase', async () => {
    expect((await patchPhase(tokens.pmA, phaseByPmA, { description: 'x' })).status).toBe(200)
  })

  test('PM-B cannot modify PM-A phase → 403', async () => {
    expect((await patchPhase(tokens.pmB, phaseByPmA, { description: 'y' })).status).toBe(403)
    expect((await deletePhase(tokens.pmB, phaseByPmA)).status).toBe(403)
  })

  test('OWNER and SUPER_ADMIN can modify any phase', async () => {
    expect((await patchPhase(tokens.owner, phaseByPmA, { description: 'byOwner' })).status).toBe(200)
    expect((await patchPhase(tokens.superadmin, phaseByPmA, { description: 'bySA' })).status).toBe(200)
  })

  test('legacy phase (createdById=null): any PM can modify, treated as project-owned', async () => {
    expect((await patchPhase(tokens.pmA, oldPhase, { description: 'z' })).status).toBe(200)
    expect((await patchPhase(tokens.pmB, oldPhase, { description: 'zz' })).status).toBe(200)
  })

  test('OWNER deletes their own then PM-A deletes their phase, PM-B deletes the legacy phase', async () => {
    expect((await deletePhase(tokens.pmA, phaseByPmA)).status).toBe(200)
    expect((await deletePhase(tokens.pmB, oldPhase)).status).toBe(200)
  })

  test('non-member MEMBER-level cannot modify → 403', async () => {
    const res = await createPhase(tokens.owner, 'm-forbidden')
    const id = ((await res.json()) as { phase: { id: string } }).phase.id
    expect((await patchPhase(tokens.member, id, { description: 'no' })).status).toBe(403)
  })
})
