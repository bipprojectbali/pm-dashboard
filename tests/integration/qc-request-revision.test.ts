import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC request-revision (READY_FOR_QC → REOPENED)', () => {
  const app = createTestApp()
  let reporterToken: string
  let adminToken: string
  let reporterId: string
  let adminId: string
  let selfProjectId: string

  const createTicket = (token: string, body: Record<string, unknown>) =>
    app
      .handle(
        new Request('http://localhost/api/qc/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
          body: JSON.stringify(body),
        }),
      )
      .then((r) => r.json().then((j) => j.ticket.id as string))

  const requestRevision = (token: string | null, id: string, body: Record<string, unknown>) =>
    app.handle(
      new Request(`http://localhost/api/qc/tickets/${id}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `session=${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    )

  const setReady = (id: string) => prisma.task.update({ where: { id }, data: { status: 'READY_FOR_QC' } })

  beforeAll(async () => {
    await cleanupTestData()
    const reporter = await seedTestUser('qc-rev-reporter@test.com', 'pass', 'Reporter', 'QC' as never)
    const admin = await seedTestUser('qc-rev-admin@test.com', 'pass', 'Admin', 'ADMIN')
    reporterId = reporter.id
    adminId = admin.id
    reporterToken = await createTestSession(reporter.id)
    adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Revision Test' }),
      }),
    )
    selfProjectId = (await projRes.json()).project.id
    await prisma.project.update({ where: { id: selfProjectId }, data: { isSelf: true } })
    await prisma.tag.upsert({
      where: { projectId_name: { projectId: selfProjectId, name: 'ai-queue' } },
      update: {},
      create: { projectId: selfProjectId, name: 'ai-queue', color: 'blue' },
    })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it('reopens the ticket, records the reason comment + status change, and notifies the reporter', async () => {
    const id = await createTicket(reporterToken, { title: 'Revision golden', description: 'x', priority: 'HIGH' })
    await setReady(id)
    const res = await requestRevision(adminToken, id, { comment: 'Fix masih error saat input kosong' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.status).toBe('REOPENED')

    const task = await prisma.task.findUnique({ where: { id }, select: { status: true, closedAt: true } })
    expect(task?.status).toBe('REOPENED')
    expect(task?.closedAt).toBeNull()

    const comment = await prisma.taskComment.findFirst({
      where: { taskId: id, body: 'Fix masih error saat input kosong' },
    })
    expect(comment).not.toBeNull()

    const change = await prisma.taskStatusChange.findFirst({
      where: { taskId: id, fromStatus: 'READY_FOR_QC', toStatus: 'REOPENED' },
    })
    expect(change).not.toBeNull()

    const notifs = await prisma.notification.findMany({
      where: { recipientId: reporterId, taskId: id, kind: 'TASK_STATUS_CHANGED' },
    })
    expect(notifs.length).toBe(1)
    expect(notifs[0].actorId).toBe(adminId)
  })

  it('rejects when the ticket is not READY_FOR_QC', async () => {
    const id = await createTicket(reporterToken, { title: 'Revision wrong-status', description: 'x', priority: 'LOW' })
    // ticket is OPEN by default
    const res = await requestRevision(adminToken, id, { comment: 'Should fail' })
    expect(res.status).toBe(400)
    const task = await prisma.task.findUnique({ where: { id }, select: { status: true } })
    expect(task?.status).toBe('OPEN')
  })

  it('rejects when the comment is empty', async () => {
    const id = await createTicket(reporterToken, { title: 'Revision empty-comment', description: 'x', priority: 'LOW' })
    await setReady(id)
    const res = await requestRevision(adminToken, id, { comment: '   ' })
    expect(res.status).toBe(400)
    const task = await prisma.task.findUnique({ where: { id }, select: { status: true } })
    expect(task?.status).toBe('READY_FOR_QC')
  })

  it('returns 401 without a session', async () => {
    const id = await createTicket(reporterToken, { title: 'Revision unauth', description: 'x', priority: 'LOW' })
    await setReady(id)
    const res = await requestRevision(null, id, { comment: 'No session' })
    expect(res.status).toBe(401)
  })
})
