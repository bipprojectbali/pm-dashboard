import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerToken = ''
let viewerToken = ''
let ownerId = ''
let projectId = ''
let tagId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('milestone-owner@example.com', 'pass123', 'Milestone Owner', 'USER')
  ownerId = owner.id
  ownerToken = await createTestSession(ownerId)

  const project = await seedTestProject(ownerId, 'Milestone Test Project')
  projectId = project.id

  const viewer = await seedTestUser('milestone-viewer@example.com', 'pass123', 'Milestone Viewer', 'USER')
  viewerToken = await createTestSession(viewer.id)
  await prisma.projectMember.create({
    data: { projectId, userId: viewer.id, role: 'VIEWER' },
  })

  // Buat tag untuk test
  const tag = await prisma.tag.create({
    data: { projectId, name: 'frontend', color: 'blue' },
  })
  tagId = tag.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/projects/:id/milestones', () => {
  test('list milestones — kosong awalnya, response includes tags[]', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.milestones)).toBe(true)
    expect(body.milestones.length).toBe(0)
  })

  test('list milestones — tanpa auth → 401', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`),
    )
    expect(res.status).toBe(401)
  })

  test('list milestones — project tidak ada → 404 atau 403', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/projects/nonexistent-proj/milestones', {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect([403, 404]).toContain(res.status)
  })
})

describe('POST /api/projects/:id/milestones', () => {
  test('create milestone tanpa tag — berhasil, tags[] kosong', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'MVP Launch', description: 'First release' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone).toBeDefined()
    expect(body.milestone.title).toBe('MVP Launch')
    expect(body.milestone.description).toBe('First release')
    expect(Array.isArray(body.milestone.tags)).toBe(true)
    expect(body.milestone.tags.length).toBe(0)
  })

  test('create milestone dengan tagIds — tags[] terisi', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Beta Release', tagIds: [tagId] }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.tags.length).toBe(1)
    expect(body.milestone.tags[0].tagId).toBe(tagId)
    expect(body.milestone.tags[0].tag.name).toBe('frontend')
  })

  test('create milestone — tanpa title → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ description: 'No title' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('create milestone — VIEWER → 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${viewerToken}` },
        body: JSON.stringify({ title: 'Viewer Milestone' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('list setelah create — shape includes tags', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/milestones`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestones.length).toBeGreaterThanOrEqual(2)
    for (const m of body.milestones) {
      expect(Array.isArray(m.tags)).toBe(true)
    }
  })
})

describe('PATCH /api/milestones/:id', () => {
  let milestoneId = ''
  let taggedMilestoneId = ''

  beforeAll(async () => {
    const m1 = await prisma.projectMilestone.create({
      data: { projectId, title: 'Patch Test Milestone', order: 50 },
    })
    milestoneId = m1.id

    const m2 = await prisma.projectMilestone.create({
      data: { projectId, title: 'Tagged Milestone', order: 51 },
    })
    taggedMilestoneId = m2.id
    await prisma.milestoneTag.create({ data: { milestoneId: m2.id, tagId } })
  })

  test('update title + description — berhasil, tags tetap ada', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Updated Milestone', description: 'New desc' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.title).toBe('Updated Milestone')
    expect(body.milestone.description).toBe('New desc')
    expect(Array.isArray(body.milestone.tags)).toBe(true)
  })

  test('update tagIds — tambah tag ke milestone kosong', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ tagIds: [tagId] }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.tags.length).toBe(1)
    expect(body.milestone.tags[0].tagId).toBe(tagId)
  })

  test('update tagIds — hapus semua tag (array kosong)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${taggedMilestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ tagIds: [] }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.tags.length).toBe(0)
  })

  test('update completed=true — completedAt terisi', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ completed: true }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.completedAt).not.toBeNull()
  })

  test('update completed=false — completedAt null', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ completed: false }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.milestone.completedAt).toBeNull()
  })

  test('update oleh VIEWER → 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${viewerToken}` },
        body: JSON.stringify({ title: 'Hacked' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('update milestone tidak ada → 404', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/milestones/nonexistent-milestone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Ghost' }),
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/milestones/:id', () => {
  test('delete milestone — berhasil', async () => {
    const m = await prisma.projectMilestone.create({
      data: { projectId, title: 'To Delete', order: 99 },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${m.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const deleted = await prisma.projectMilestone.findUnique({ where: { id: m.id } })
    expect(deleted).toBeNull()
  })

  test('delete oleh VIEWER → 403', async () => {
    const m = await prisma.projectMilestone.create({
      data: { projectId, title: 'Viewer Cannot Delete', order: 100 },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/milestones/${m.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${viewerToken}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  test('delete milestone tidak ada → 404', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/milestones/nonexistent', {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(404)
  })

  test('delete milestone — MilestoneTag ikut cascade', async () => {
    const tag2 = await prisma.tag.create({ data: { projectId, name: 'cascade-test', color: 'green' } })
    const m = await prisma.projectMilestone.create({
      data: { projectId, title: 'Cascade Delete', order: 101 },
    })
    await prisma.milestoneTag.create({ data: { milestoneId: m.id, tagId: tag2.id } })

    await app.handle(
      new Request(`http://localhost/api/milestones/${m.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )

    const orphan = await prisma.milestoneTag.findFirst({ where: { milestoneId: m.id } })
    expect(orphan).toBeNull()
  })
})
