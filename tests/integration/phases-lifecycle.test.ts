import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestProject, seedTestTask, seedTestUser } from '../helpers'

// Phase lifecycle surfaces that each self-seed their own phases and don't depend
// on the create/uniqueness ordering in phases.test.ts: PATCH, DELETE, the
// task?phaseId= filter, and phase tags. Kept in a separate file so neither
// exceeds the test file-size limit; distinct fixture emails keep the two
// independent even under a shared test DB.
const app = createTestApp()

let ownerToken = ''
let viewerToken = ''
let ownerId = ''
let projectId = ''

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('phases-lc-owner@example.com', 'pass123', 'Phase LC Owner', 'USER')
  ownerId = owner.id
  ownerToken = await createTestSession(ownerId)

  const project = await seedTestProject(ownerId, 'Phases Lifecycle Project')
  projectId = project.id

  const viewer = await seedTestUser('phases-lc-viewer@example.com', 'pass123', 'Phase LC Viewer', 'USER')
  viewerToken = await createTestSession(viewer.id)
  await prisma.projectMember.create({
    data: { projectId, userId: viewer.id, role: 'VIEWER' },
  })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
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

describe('Phase tags', () => {
  let phaseId = ''
  let tagId = ''

  beforeAll(async () => {
    const phase = await prisma.projectPhase.create({
      data: { projectId, title: 'Tag Test Phase', status: 'PLANNING', order: 99 },
    })
    phaseId = phase.id
    const tag = await prisma.tag.create({
      data: { projectId, name: 'frontend', color: 'blue' },
    })
    tagId = tag.id
  })

  test('PATCH /api/phases/:id dengan tagIds → tags tersimpan', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: [tagId] }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.tags).toHaveLength(1)
    expect(body.phase.tags[0].tagId).toBe(tagId)
    expect(body.phase.tags[0].tag.name).toBe('frontend')
  })

  test('GET /api/projects/:id/phases → phases include tags', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/phases`, {
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const phase = body.phases.find((p: { id: string }) => p.id === phaseId)
    expect(phase).toBeDefined()
    expect(Array.isArray(phase.tags)).toBe(true)
    expect(phase.tags.some((t: { tagId: string }) => t.tagId === tagId)).toBe(true)
  })

  test('PATCH dengan tagIds=[] → hapus semua tags', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { cookie: `session=${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: [] }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase.tags).toHaveLength(0)
  })
})
