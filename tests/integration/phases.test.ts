import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestTask, seedTestUser } from '../helpers'

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

describe('PATCH /api/phases/:id', () => {
  let phaseId = ''

  beforeAll(async () => {
    const phase = await prisma.projectPhase.create({
      data: { projectId, title: 'Phase Patch Test', status: 'PLANNING', order: 10 },
    })
    phaseId = phase.id
  })

  test('update title — berhasil', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Phase Updated' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.title).toBe('Phase Updated')
  })

  test('update status → ACTIVE', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.status).toBe('ACTIVE')
  })

  test('update tanggal — startsAt dan endsAt', async () => {
    const startsAt = new Date('2026-07-01').toISOString()
    const endsAt = new Date('2026-07-31').toISOString()
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ startsAt, endsAt }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.startsAt).toBeDefined()
    expect(body.phase.endsAt).toBeDefined()
  })

  test('update oleh VIEWER → 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${viewerToken}` },
        body: JSON.stringify({ title: 'Hacked' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('update phase tidak ada → 404', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/phases/nonexistent-phase-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ title: 'Ghost' }),
      }),
    )
    expect(res.status).toBe(404)
  })

  test('update summary + status COMPLETED — summary tersimpan', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: `session=${ownerToken}` },
        body: JSON.stringify({ status: 'COMPLETED', summary: 'Sprint selesai, semua target tercapai.' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.summary).toBe('Sprint selesai, semua target tercapai.')
    expect(body.phase.status).toBe('COMPLETED')
  })

  test('list phases — field summary ikut dalam response', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const patchedPhase = body.phases.find((p: { id: string }) => p.id === phaseId)
    expect(patchedPhase).toBeDefined()
    expect(patchedPhase?.summary).toBe('Sprint selesai, semua target tercapai.')
  })
})

describe('DELETE /api/phases/:id', () => {
  test('delete phase — task.phaseId → null (SET NULL)', async () => {
    // Buat fase baru
    const phase = await prisma.projectPhase.create({
      data: { projectId, title: 'Phase To Delete', status: 'PLANNING', order: 99 },
    })

    // Buat task yang terhubung ke fase
    const task = await seedTestTask(projectId, ownerId, { title: 'Task In Phase' })
    await prisma.task.update({ where: { id: task.id }, data: { phaseId: phase.id } })

    // Hapus fase
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phase.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Task phaseId harus null setelah fase dihapus
    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } })
    expect(updatedTask?.phaseId).toBeNull()
  })

  test('delete oleh VIEWER → 403', async () => {
    const phase = await prisma.projectPhase.create({
      data: { projectId, title: 'Phase Viewer Delete', status: 'PLANNING', order: 100 },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phase.id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${viewerToken}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  test('delete phase tidak ada → 404', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/phases/nonexistent', {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/tasks?phaseId=X — filter by phase', () => {
  let phaseAId = ''

  beforeAll(async () => {
    // Buat dua fase
    const phaseA = await prisma.projectPhase.create({
      data: { projectId, title: 'Phase A Filter', status: 'ACTIVE', order: 50 },
    })
    phaseAId = phaseA.id
    await prisma.projectPhase.create({
      data: { projectId, title: 'Phase B Filter', status: 'PLANNING', order: 51 },
    })

    // Buat task di Phase A dan tanpa fase
    const taskInPhase = await seedTestTask(projectId, ownerId, { title: 'Task Dengan Fase' })
    await prisma.task.update({ where: { id: taskInPhase.id }, data: { phaseId: phaseAId } })
    await seedTestTask(projectId, ownerId, { title: 'Task Tanpa Fase' })
  })

  test('filter phaseId=X — hanya task di fase tersebut', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&phaseId=${phaseAId}`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    for (const t of body.tasks) {
      expect(t.phaseId ?? t.phase?.id).toBe(phaseAId)
    }
    // Harus ada setidaknya satu task
    expect(body.tasks.length).toBeGreaterThan(0)
  })

  test('filter phaseId=none — hanya task tanpa fase', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks?projectId=${projectId}&phaseId=none`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    for (const t of body.tasks) {
      expect(t.phaseId ?? null).toBeNull()
    }
    expect(body.tasks.length).toBeGreaterThan(0)
  })
})
