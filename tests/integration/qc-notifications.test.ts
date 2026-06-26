import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC ticket status-change notifications', () => {
  const app = createTestApp()
  let reporterToken: string
  let adminToken: string
  let reporterId: string
  let adminId: string
  let assigneeId: string
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

  const patchTicket = (token: string, id: string, body: Record<string, unknown>) =>
    app.handle(
      new Request(`http://localhost/api/qc/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
        body: JSON.stringify(body),
      }),
    )

  const notifsFor = (recipientId: string, taskId: string) =>
    prisma.notification.findMany({
      where: { recipientId, taskId, kind: 'TASK_STATUS_CHANGED' },
    })

  beforeAll(async () => {
    await cleanupTestData()
    const reporter = await seedTestUser('qc-notif-reporter@test.com', 'pass', 'Reporter', 'QC' as never)
    const admin = await seedTestUser('qc-notif-admin@test.com', 'pass', 'Admin', 'ADMIN')
    const assignee = await seedTestUser('qc-notif-assignee@test.com', 'pass', 'Assignee', 'QC' as never)
    reporterId = reporter.id
    adminId = admin.id
    assigneeId = assignee.id
    reporterToken = await createTestSession(reporter.id)
    adminToken = await createTestSession(admin.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Notif Test' }),
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

  it('notifies the reporter when a different actor transitions the ticket', async () => {
    const id = await createTicket(reporterToken, { title: 'Notif golden path', description: 'x', priority: 'HIGH' })
    const res = await patchTicket(adminToken, id, { status: 'READY_FOR_QC' })
    expect(res.status).toBe(200)
    const notifs = await notifsFor(reporterId, id)
    expect(notifs.length).toBe(1)
    expect(notifs[0].actorId).toBe(adminId)
  })

  it('notifies both reporter and assignee on transition by a third actor', async () => {
    const id = await createTicket(reporterToken, { title: 'Notif fanout', description: 'x', priority: 'MEDIUM' })
    await patchTicket(adminToken, id, { assigneeId })
    const res = await patchTicket(adminToken, id, { status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    const [forReporter, forAssignee] = await Promise.all([notifsFor(reporterId, id), notifsFor(assigneeId, id)])
    expect(forReporter.length).toBe(1)
    expect(forAssignee.length).toBe(1)
  })

  it('does not notify the actor when actor is also the recipient', async () => {
    const id = await createTicket(reporterToken, { title: 'Notif self-action', description: 'x', priority: 'LOW' })
    const res = await patchTicket(reporterToken, id, { status: 'READY_FOR_QC' })
    expect(res.status).toBe(200)
    const notifs = await notifsFor(reporterId, id)
    expect(notifs.length).toBe(0)
  })

  it('does not create a notification when status is unchanged', async () => {
    const id = await createTicket(reporterToken, { title: 'Notif no-status-change', description: 'x', priority: 'LOW' })
    const res = await patchTicket(adminToken, id, { priority: 'HIGH' })
    expect(res.status).toBe(200)
    const notifs = await notifsFor(reporterId, id)
    expect(notifs.length).toBe(0)
  })
})
