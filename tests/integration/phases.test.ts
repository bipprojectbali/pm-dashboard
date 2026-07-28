import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerToken = ''
let viewerToken = ''
let ownerId = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('phases-owner@example.com', 'pass123', 'Phase Owner', 'USER')
  ownerId = owner.id
  ownerToken = await createTestSession(ownerId)

  const project = await seedTestProject(ownerId, 'Phases Test Project')
  projectId = project.id

  const viewer = await seedTestUser('phases-viewer@example.com', 'pass123', 'Phase Viewer', 'USER')
  viewerToken = await createTestSession(viewer.id)
  await prisma.projectMember.create({
    data: { projectId, userId: viewer.id, role: 'VIEWER' },
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/projects/:id/phases', () => {
  test('list phases — kosong awalnya', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.phases)).toBe(true)
    expect(body.phases.length).toBe(0)
  })

  test('list phases — tanpa auth → 401', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`),
    )
    expect(res.status).toBe(401)
  })
})

describe('POST /api/projects/:id/phases', () => {
  test('create phase — OWNER berhasil', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Sprint 1', status: 'PLANNING' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBeDefined()
    expect(body.phase.title).toBe('Sprint 1')
    expect(body.phase.status).toBe('PLANNING')
    expect(body.phase.order).toBe(0)
  })

  test('create phase kedua — auto-order increment', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Sprint 2', status: 'PLANNING' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.order).toBe(1)
  })

  test('create phase — VIEWER → 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${viewerToken}` },
        body: JSON.stringify({ title: 'Viewer Sprint' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('create phase — tanpa title → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('create phase — status tidak valid → 400', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Bad Status', status: 'INVALID' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('list phases setelah create — count benar', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phases.length).toBeGreaterThanOrEqual(2)
    // Setiap fase memiliki _count.tasks
    for (const p of body.phases) {
      expect(typeof p._count.tasks).toBe('number')
    }
  })
})

describe('Keunikan nama fase per project', () => {
  test('create — nama duplikat persis → 409', async () => {
    // "Sprint 1" sudah dibuat di describe POST sebelumnya
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Sprint 1' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  test('create — duplikat case-insensitive + spasi → 409', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: '  sprint 1  ' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  test('create — nama sama di project lain → boleh (scoped per project)', async () => {
    const other = await seedTestProject(ownerId, 'Phases Other Project')
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${other.id}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Sprint 1' }),
      }),
    )
    expect(res.status).toBe(200)
  })

  test('rename ke nama fase lain yang sudah ada → 409', async () => {
    const target = await prisma.projectPhase.findFirst({
      where: { projectId, title: 'Sprint 2' },
      select: { id: true },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${target!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Sprint 1' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  test('rename ke nama sendiri (case beda) → boleh', async () => {
    const self = await prisma.projectPhase.findFirst({
      where: { projectId, title: 'Sprint 2' },
      select: { id: true },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${self!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'SPRINT 2' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.title).toBe('SPRINT 2')
  })
})

// PATCH / DELETE / task-filter / phase-tags lifecycle tests live in
// phases-lifecycle.test.ts — split out to keep each file within the test
// file-size limit. This file keeps the create + name-uniqueness suite, whose
// tests share sequential state ("Sprint 1"/"Sprint 2").
