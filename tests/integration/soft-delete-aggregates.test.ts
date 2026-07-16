import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// A soft-deleted (trashed) task must disappear from every aggregate — KPIs,
// project health, risk report, retro — yet still be visible in the Trash until
// purged. The soft-delete client extension enforces this centrally; these tests
// lock the behaviour end-to-end through the HTTP surface.
const app = createTestApp()

let adminToken: string
let adminId: string
let projectId: string
let taskId: string
let phaseId: string

const get = (path: string, token: string) =>
  app.handle(new Request(`http://localhost${path}`, { headers: { Cookie: `session=${token}` } }))

const del = (path: string, token: string, body: Record<string, unknown>) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('softdel-admin@test.com', 'pass', 'Admin', 'SUPER_ADMIN')
  adminId = admin.id
  adminToken = await createTestSession(admin.id)
  const project = await prisma.project.create({
    data: {
      name: 'Soft Delete Project',
      ownerId: adminId,
      status: 'ACTIVE',
      priority: 'HIGH',
      visibility: 'PRIVATE',
      members: { create: { userId: adminId, role: 'OWNER' } },
    },
  })
  projectId = project.id
  const phase = await prisma.projectPhase.create({
    data: { projectId, title: 'Awal', status: 'PLANNING', order: 0 },
  })
  phaseId = phase.id
  // An overdue, open task assigned to the admin, linked to the phase — shows up
  // in every aggregate AND in the phase's task count.
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const task = await prisma.task.create({
    data: {
      projectId,
      phaseId,
      reporterId: adminId,
      assigneeId: adminId,
      title: 'Overdue trashable task',
      description: 'd',
      kind: 'TASK',
      status: 'OPEN',
      priority: 'HIGH',
      dueAt: past,
    },
  })
  taskId = task.id
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('soft-deleted tasks are excluded from aggregates', () => {
  it('counts the task in KPIs + risks BEFORE deletion', async () => {
    const kpis = await get('/api/admin/overview/kpis', adminToken).then((r) => r.json())
    expect(kpis.tasks.total).toBeGreaterThanOrEqual(1)
    expect(kpis.tasks.overdueOpen).toBeGreaterThanOrEqual(1)

    const risks = await get('/api/admin/overview/risks', adminToken).then((r) => r.json())
    const titles = (risks.overdueTasks ?? []).map((t: { title: string }) => t.title)
    expect(titles).toContain('Overdue trashable task')

    // Phase task count includes the live task before deletion.
    const phases = await get(`/api/projects/${projectId}/phases`, adminToken).then((r) => r.json())
    const phase = phases.phases.find((p: { id: string }) => p.id === phaseId)
    expect(phase._count.tasks).toBe(1)
  })

  it('drops the task from KPIs, risks, and health AFTER soft-delete', async () => {
    const kpisBefore = await get('/api/admin/overview/kpis', adminToken).then((r) => r.json())
    const totalBefore = kpisBefore.tasks.total
    const overdueBefore = kpisBefore.tasks.overdueOpen

    const res = await del(`/api/tasks/${taskId}`, adminToken, { reason: 'test trash' })
    expect(res.status).toBe(200)

    const kpis = await get('/api/admin/overview/kpis', adminToken).then((r) => r.json())
    expect(kpis.tasks.total).toBe(totalBefore - 1)
    expect(kpis.tasks.overdueOpen).toBe(overdueBefore - 1)

    const risks = await get('/api/admin/overview/risks', adminToken).then((r) => r.json())
    const titles = (risks.overdueTasks ?? []).map((t: { title: string }) => t.title)
    expect(titles).not.toContain('Overdue trashable task')

    const health = await get(`/api/admin/overview/health?projectId=${projectId}`, adminToken).then((r) => r.json())
    const row = health.projects.find((p: { id: string }) => p.id === projectId)
    expect(row.overdueTasks).toBe(0)
    expect(row.counts.tasks).toBe(0) // relation count also excludes trashed

    // Phase task count + project Tasks-tab badge must drop the trashed task too.
    const phases = await get(`/api/projects/${projectId}/phases`, adminToken).then((r) => r.json())
    const phase = phases.phases.find((p: { id: string }) => p.id === phaseId)
    expect(phase._count.tasks).toBe(0)

    const project = await get(`/api/projects/${projectId}`, adminToken).then((r) => r.json())
    expect(project.project._count.tasks).toBe(0)
  })

  it('still lists the trashed task in Trash', async () => {
    const trash = await get('/api/tasks/trash', adminToken).then((r) => r.json())
    const ids = (trash.tasks ?? trash.items ?? []).map((t: { id: string }) => t.id)
    expect(ids).toContain(taskId)
  })

  it('restores the task back into aggregates', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/tasks/${taskId}/restore`, {
        method: 'POST',
        headers: { Cookie: `session=${adminToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const risks = await get('/api/admin/overview/risks', adminToken).then((r) => r.json())
    const titles = (risks.overdueTasks ?? []).map((t: { title: string }) => t.title)
    expect(titles).toContain('Overdue trashable task')

    // Restoring the task returns it to the phase count as well.
    const phases = await get(`/api/projects/${projectId}/phases`, adminToken).then((r) => r.json())
    const phase = phases.phases.find((p: { id: string }) => p.id === phaseId)
    expect(phase._count.tasks).toBe(1)
  })
})
