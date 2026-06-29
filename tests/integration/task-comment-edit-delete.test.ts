import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

describe('Task comment edit/delete (author-or-admin)', () => {
  const app = createTestApp()
  let authorToken: string
  let adminToken: string
  let otherToken: string
  let authorId: string
  let otherId: string
  let projectId: string

  const addComment = (token: string, taskId: string, body: string) =>
    app
      .handle(
        new Request(`http://localhost/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
          body: JSON.stringify({ body }),
        }),
      )
      .then((r) => r.json().then((j) => j.comment.id as string))

  const editComment = (token: string | null, taskId: string, commentId: string, body: Record<string, unknown>) =>
    app.handle(
      new Request(`http://localhost/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `session=${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    )

  const deleteComment = (token: string | null, taskId: string, commentId: string) =>
    app.handle(
      new Request(`http://localhost/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: token ? { Cookie: `session=${token}` } : {},
      }),
    )

  let taskId: string

  beforeAll(async () => {
    await cleanupTestData()
    const author = await seedTestUser('task-cmt-author@test.com', 'pass', 'Author', 'USER')
    const admin = await seedTestUser('task-cmt-admin@test.com', 'pass', 'Admin', 'ADMIN')
    const other = await seedTestUser('task-cmt-other@test.com', 'pass', 'Other', 'USER')
    authorId = author.id
    otherId = other.id
    authorToken = await createTestSession(author.id)
    adminToken = await createTestSession(admin.id)
    otherToken = await createTestSession(other.id)

    // Author owns the project; "other" is a MEMBER (writable, but not the comment's author or a system admin).
    const project = await prisma.project.create({
      data: {
        name: 'Task Comment Test Project',
        ownerId: authorId,
        status: 'ACTIVE',
        priority: 'MEDIUM',
        visibility: 'PRIVATE',
        members: {
          create: [
            { userId: authorId, role: 'OWNER' },
            { userId: otherId, role: 'MEMBER' },
          ],
        },
      },
    })
    projectId = project.id
    const task = await prisma.task.create({
      data: { projectId, reporterId: authorId, title: 'Task subject', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    taskId = task.id
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  const seedComment = (body = 'original body') => addComment(authorToken, taskId, body)

  it('lets the author edit their comment and stamps editedAt', async () => {
    const commentId = await seedComment()
    const res = await editComment(authorToken, taskId, commentId, { body: 'edited by author' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.comment.body).toBe('edited by author')

    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true, editedAt: true } })
    expect(row?.body).toBe('edited by author')
    expect(row?.editedAt).not.toBeNull()
  })

  it('lets an admin edit another user comment', async () => {
    const commentId = await seedComment()
    const res = await editComment(adminToken, taskId, commentId, { body: 'edited by admin' })
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true } })
    expect(row?.body).toBe('edited by admin')
  })

  it('rejects an edit with an empty body (400)', async () => {
    const commentId = await seedComment()
    const res = await editComment(authorToken, taskId, commentId, { body: '   ' })
    expect(res.status).toBe(400)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true, editedAt: true } })
    expect(row?.body).toBe('original body')
    expect(row?.editedAt).toBeNull()
  })

  it('forbids a non-author non-admin member from editing (403)', async () => {
    const commentId = await seedComment()
    const res = await editComment(otherToken, taskId, commentId, { body: 'should not apply' })
    expect(res.status).toBe(403)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { body: true } })
    expect(row?.body).toBe('original body')
  })

  it('returns 404 for an unknown comment id', async () => {
    const res = await editComment(authorToken, taskId, 'does-not-exist', { body: 'x' })
    expect(res.status).toBe(404)
  })

  it('returns 401 without a session', async () => {
    const commentId = await seedComment()
    const res = await editComment(null, taskId, commentId, { body: 'no session' })
    expect(res.status).toBe(401)
  })

  it('lets the author delete their comment', async () => {
    const commentId = await seedComment()
    const res = await deleteComment(authorToken, taskId, commentId)
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).toBeNull()
  })

  it('lets an admin delete another user comment', async () => {
    const commentId = await seedComment()
    const res = await deleteComment(adminToken, taskId, commentId)
    expect(res.status).toBe(200)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).toBeNull()
  })

  it('forbids a non-author non-admin member from deleting (403)', async () => {
    const commentId = await seedComment()
    const res = await deleteComment(otherToken, taskId, commentId)
    expect(res.status).toBe(403)
    const row = await prisma.taskComment.findUnique({ where: { id: commentId } })
    expect(row).not.toBeNull()
  })
})
