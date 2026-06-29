import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('QC comment edit/delete (author-or-admin)', () => {
  const app = createTestApp()
  let authorToken: string
  let adminToken: string
  let otherToken: string
  let authorId: string
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

  const addComment = (token: string, id: string, body: string) =>
    app
      .handle(
        new Request(`http://localhost/api/qc/tickets/${id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
          body: JSON.stringify({ body }),
        }),
      )
      .then((r) => r.json().then((j) => j.comment.id as string))

  const editComment = (token: string | null, ticketId: string, commentId: string, body: Record<string, unknown>) =>
    app.handle(
      new Request(`http://localhost/api/qc/tickets/${ticketId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `session=${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    )

  const deleteComment = (token: string | null, ticketId: string, commentId: string) =>
    app.handle(
      new Request(`http://localhost/api/qc/tickets/${ticketId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: token ? { Cookie: `session=${token}` } : {},
      }),
    )

  beforeAll(async () => {
    await cleanupTestData()
    const author = await seedTestUser('qc-cmt-author@test.com', 'pass', 'Author', 'QC' as never)
    const admin = await seedTestUser('qc-cmt-admin@test.com', 'pass', 'Admin', 'ADMIN')
    const other = await seedTestUser('qc-cmt-other@test.com', 'pass', 'Other', 'QC' as never)
    authorId = author.id
    authorToken = await createTestSession(author.id)
    adminToken = await createTestSession(admin.id)
    otherToken = await createTestSession(other.id)

    const projRes = await app.handle(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `session=${adminToken}` },
        body: JSON.stringify({ name: 'Self Project Comment Test' }),
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

  const seedTicketWithComment = async (commentBody = 'original body') => {
    const ticketId = await createTicket(authorToken, { title: 'Comment subject', description: 'x', priority: 'LOW' })
    const commentId = await addComment(authorToken, ticketId, commentBody)
    return { ticketId, commentId }
  }

  it('lets the author edit their comment and stamps editedAt', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await editComment(authorToken, ticketId, commentId, { body: 'edited by author' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.comment.body).toBe('edited by author')

    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true, editedAt: true } })
    expect(row?.body).toBe('edited by author')
    expect(row?.editedAt).not.toBeNull()
  })

  it('lets an admin edit another user comment', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await editComment(adminToken, ticketId, commentId, { body: 'edited by admin' })
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true } })
    expect(row?.body).toBe('edited by admin')
  })

  it('rejects an edit with an empty body (400)', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await editComment(authorToken, ticketId, commentId, { body: '   ' })
    expect(res.status).toBe(400)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true, editedAt: true } })
    expect(row?.body).toBe('original body')
    expect(row?.editedAt).toBeNull()
  })

  it('forbids a non-author non-admin from editing (403)', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await editComment(otherToken, ticketId, commentId, { body: 'should not apply' })
    expect(res.status).toBe(403)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true } })
    expect(row?.body).toBe('original body')
  })

  it('returns 404 for an unknown comment id', async () => {
    const { ticketId } = await seedTicketWithComment()
    const res = await editComment(authorToken, ticketId, 'does-not-exist', { body: 'x' })
    expect(res.status).toBe(404)
  })

  it('returns 401 without a session', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await editComment(null, ticketId, commentId, { body: 'no session' })
    expect(res.status).toBe(401)
  })

  it('lets the author delete their comment', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await deleteComment(authorToken, ticketId, commentId)
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).toBeNull()
  })

  it('lets an admin delete another user comment', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await deleteComment(adminToken, ticketId, commentId)
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).toBeNull()
  })

  it('forbids a non-author non-admin from deleting (403)', async () => {
    const { ticketId, commentId } = await seedTicketWithComment()
    const res = await deleteComment(otherToken, ticketId, commentId)
    expect(res.status).toBe(403)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).not.toBeNull()
  })
})
