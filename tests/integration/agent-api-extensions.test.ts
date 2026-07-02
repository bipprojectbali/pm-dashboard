import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generateProjectToken } from '../../src/lib/project-access-tokens'
import { prisma } from '../helpers'
import { createTestApp } from '../helpers'

const app = createTestApp()

let ownerId = ''
let projectId = ''
let otherProjectId = ''
let writeToken = ''
let readToken = ''

let taskId = ''
let otherTaskId = ''
let tagId = ''
let agentCommentId = ''
let humanCommentId = ''

async function makeToken(pid: string, scope: 'READ' | 'WRITE') {
  const { raw, hash, prefix } = generateProjectToken()
  await prisma.projectAccessToken.create({
    data: { projectId: pid, createdById: ownerId, name: `ext-${scope}`, tokenHash: hash, tokenPrefix: prefix, scope, status: 'ACTIVE' },
  })
  return raw
}

function req(token: string | null, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

beforeAll(async () => {
  // Targeted setup using unique email to avoid conflicts with agent-api.test.ts.
  // No cleanupTestData() here — that test file owns the global cleanup timing.
  const hash = await Bun.password.hash('pass123', { algorithm: 'bcrypt' })
  const owner = await prisma.user.upsert({
    where: { email: 'agent-ext@example.com' },
    update: {},
    create: { email: 'agent-ext@example.com', name: 'Agent Ext', password: hash, role: 'USER' },
  })
  ownerId = owner.id

  const proj = await prisma.project.create({
    data: { name: 'Ext Test Project', ownerId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE', members: { create: { userId: ownerId, role: 'OWNER' } } },
  })
  projectId = proj.id

  const otherProj = await prisma.project.create({
    data: { name: 'Ext Other Project', ownerId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE', members: { create: { userId: ownerId, role: 'OWNER' } } },
  })
  otherProjectId = otherProj.id

  const tag = await prisma.tag.create({ data: { projectId, name: 'backend', color: '#ff0000' } })
  tagId = tag.id

  const task = await prisma.task.create({
    data: { projectId, reporterId: ownerId, title: 'Ext Task', description: 'desc', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
  })
  taskId = task.id

  const otherTask = await prisma.task.create({
    data: { projectId: otherProjectId, reporterId: ownerId, title: 'Other Task', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
  })
  otherTaskId = otherTask.id

  // Comments for edit/delete tests
  const agentComment = await prisma.taskComment.create({
    data: { taskId, authorId: ownerId, authorTag: 'AGENT', body: 'original agent comment' },
  })
  agentCommentId = agentComment.id

  const humanComment = await prisma.taskComment.create({
    data: { taskId, authorId: ownerId, authorTag: 'USER', body: 'human comment' },
  })
  humanCommentId = humanComment.id

  writeToken = await makeToken(projectId, 'WRITE')
  readToken = await makeToken(projectId, 'READ')
})

afterAll(async () => {
  // Clean up only our data by email anchor to avoid nuking parallel test data.
  const user = await prisma.user.findUnique({ where: { email: 'agent-ext@example.com' } })
  if (!user) return
  const projects = await prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } })
  const pids = projects.map((p) => p.id)
  const tasks = await prisma.task.findMany({ where: { projectId: { in: pids } }, select: { id: true } })
  const tids = tasks.map((t) => t.id)
  await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: tids } }, { blockedById: { in: tids } }] } })
  await prisma.taskTag.deleteMany({ where: { taskId: { in: tids } } })
  await prisma.taskChecklistItem.deleteMany({ where: { taskId: { in: tids } } })
  await prisma.taskStatusChange.deleteMany({ where: { taskId: { in: tids } } })
  await prisma.taskComment.deleteMany({ where: { taskId: { in: tids } } })
  await prisma.taskEvidence.deleteMany({ where: { taskId: { in: tids } } })
  await prisma.task.deleteMany({ where: { id: { in: tids } } })
  await prisma.tag.deleteMany({ where: { projectId: { in: pids } } })
  await prisma.projectAccessToken.deleteMany({ where: { projectId: { in: pids } } })
  await prisma.projectMember.deleteMany({ where: { projectId: { in: pids } } })
  await prisma.project.deleteMany({ where: { id: { in: pids } } })
  await prisma.user.delete({ where: { id: user.id } })
  await prisma.$disconnect()
})

// ─── Evidence ───────────────────────────────────────────────────────────────

describe('POST /api/agent/tasks/:id/evidence', () => {
  test('happy path — adds link evidence', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/evidence`, { url: 'https://example.com/screenshot.png', note: 'proof' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.evidence.url).toBe('https://example.com/screenshot.png')
    expect(body.evidence.kind).toBe('LINK')
  })
  test('missing url → 400', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/evidence`, { note: 'no url' })
    expect(res.status).toBe(400)
  })
  test('read-only token → 403', async () => {
    const res = await req(readToken, 'POST', `/api/agent/tasks/${taskId}/evidence`, { url: 'https://x.com' })
    expect(res.status).toBe(403)
  })
  test('cross-project task → 404', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${otherTaskId}/evidence`, { url: 'https://x.com' })
    expect(res.status).toBe(404)
  })
})

// ─── Dependencies ────────────────────────────────────────────────────────────

describe('dependencies', () => {
  let blockerTaskId = ''
  beforeAll(async () => {
    const t = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'Blocker', description: '', kind: 'TASK', status: 'OPEN', priority: 'HIGH' },
    })
    blockerTaskId = t.id
  })

  test('POST add dependency — happy path', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/dependencies`, { blockedById: blockerTaskId })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dependency.taskId).toBe(taskId)
    expect(body.dependency.blockedById).toBe(blockerTaskId)
  })
  test('duplicate dependency → 409', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/dependencies`, { blockedById: blockerTaskId })
    expect(res.status).toBe(409)
  })
  test('self-loop → 400', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/dependencies`, { blockedById: taskId })
    expect(res.status).toBe(400)
  })
  test('cycle detection → 400', async () => {
    // blockerTaskId → taskId would create a cycle since taskId → blockerTaskId already exists
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${blockerTaskId}/dependencies`, { blockedById: taskId })
    expect(res.status).toBe(400)
  })
  test('cross-project blocker → 400', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${taskId}/dependencies`, { blockedById: otherTaskId })
    expect(res.status).toBe(400)
  })
  test('DELETE remove dependency', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${taskId}/dependencies/${blockerTaskId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ─── Claim ───────────────────────────────────────────────────────────────────

describe('POST /api/agent/tasks/:id/claim', () => {
  let claimTaskId = ''
  beforeAll(async () => {
    const t = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'To Claim', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    claimTaskId = t.id
  })

  test('happy path — OPEN → IN_PROGRESS', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${claimTaskId}/claim`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.from).toBe('OPEN')
    expect(body.to).toBe('IN_PROGRESS')
  })
  test('already IN_PROGRESS → 409', async () => {
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${claimTaskId}/claim`)
    expect(res.status).toBe(409)
  })
  test('read-only token → 403', async () => {
    const res = await req(readToken, 'POST', `/api/agent/tasks/${claimTaskId}/claim`)
    expect(res.status).toBe(403)
  })
  test('IDEA task → 403', async () => {
    const idea = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'idea', description: '', kind: 'IDEA', status: 'OPEN', priority: 'LOW' },
    })
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${idea.id}/claim`)
    expect(res.status).toBe(403)
  })
})

// ─── Soft delete ─────────────────────────────────────────────────────────────

describe('DELETE /api/agent/tasks/:id', () => {
  let deleteTaskId = ''
  beforeAll(async () => {
    const t = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'To Delete', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    deleteTaskId = t.id
  })

  test('happy path — soft delete', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${deleteTaskId}`)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
  test('deleted task → 404 on GET', async () => {
    const res = await req(readToken, 'GET', `/api/agent/tasks/${deleteTaskId}`)
    expect(res.status).toBe(404)
  })
  test('cross-project task → 404', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${otherTaskId}`)
    expect(res.status).toBe(404)
  })
})

// ─── Comment edit/delete ──────────────────────────────────────────────────────

describe('PATCH/DELETE comment', () => {
  test('PATCH AGENT comment — happy path', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${taskId}/comments/${agentCommentId}`, { body: 'edited comment' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comment.body).toBe('edited comment')
    expect(body.comment.editedAt).not.toBeNull()
  })
  test('PATCH non-AGENT comment → 403', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${taskId}/comments/${humanCommentId}`, { body: 'hack' })
    expect(res.status).toBe(403)
  })
  test('PATCH missing body → 400', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${taskId}/comments/${agentCommentId}`, {})
    expect(res.status).toBe(400)
  })
  test('DELETE non-AGENT comment → 403', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${taskId}/comments/${humanCommentId}`)
    expect(res.status).toBe(403)
  })
  test('DELETE AGENT comment — happy path', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${taskId}/comments/${agentCommentId}`)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
  test('DELETE already-gone comment → 404', async () => {
    const res = await req(writeToken, 'DELETE', `/api/agent/tasks/${taskId}/comments/${agentCommentId}`)
    expect(res.status).toBe(404)
  })
})

// ─── PATCH field parity ───────────────────────────────────────────────────────

describe('PATCH /api/agent/tasks/:id (field parity)', () => {
  let patchTaskId = ''
  beforeAll(async () => {
    const t = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'Parity Task', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    patchTaskId = t.id
  })

  test('tagIds replace set', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { tagIds: [tagId] })
    expect(res.status).toBe(200)
    const row = await prisma.taskTag.findFirst({ where: { taskId: patchTaskId, tagId } })
    expect(row).not.toBeNull()
  })
  test('tagIds = [] clears tags', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { tagIds: [] })
    expect(res.status).toBe(200)
    const count = await prisma.taskTag.count({ where: { taskId: patchTaskId } })
    expect(count).toBe(0)
  })
  test('startsAt sets date', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { startsAt: '2026-01-01T00:00:00Z' })
    expect(res.status).toBe(200)
    const task = await prisma.task.findUnique({ where: { id: patchTaskId } })
    expect(task?.startsAt).not.toBeNull()
  })
  test('invalid startsAt → 400', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { startsAt: 'garbage' })
    expect(res.status).toBe(400)
  })
  test('kind TASK→BUG allowed', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { kind: 'BUG' })
    expect(res.status).toBe(200)
    const task = await prisma.task.findUnique({ where: { id: patchTaskId } })
    expect(task?.kind).toBe('BUG')
  })
  test('kind → IDEA forbidden', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { kind: 'IDEA' })
    expect(res.status).toBe(403)
  })
  test('route field set', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${patchTaskId}`, { route: '/dashboard' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.route).toBe('/dashboard')
  })
})

// ─── retryCount in detail ─────────────────────────────────────────────────────

describe('GET /api/agent/tasks/:id retryCount', () => {
  test('retryCount and shouldEscalate present', async () => {
    const res = await req(readToken, 'GET', `/api/agent/tasks/${taskId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.task.retryCount).toBe('number')
    expect(typeof body.task.shouldEscalate).toBe('boolean')
    expect(body.task.retryCount).toBe(0)
    expect(body.task.shouldEscalate).toBe(false)
  })
})

// ─── ?tag= filter ────────────────────────────────────────────────────────────

describe('GET /api/agent/tasks?tag=', () => {
  let taggedTaskId = ''
  beforeAll(async () => {
    const t = await prisma.task.create({
      data: {
        projectId, reporterId: ownerId, title: 'Tagged Task', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM',
        tags: { create: { tagId } },
      },
    })
    taggedTaskId = t.id
  })

  test('filter by existing tag name returns only tagged tasks', async () => {
    const res = await req(readToken, 'GET', '/api/agent/tasks?tag=backend')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks.every((t: { tags: { tag: { name: string } }[] }) =>
      t.tags.some((tt) => tt.tag.name === 'backend'),
    )).toBe(true)
    const ids = body.tasks.map((t: { id: string }) => t.id)
    expect(ids).toContain(taggedTaskId)
  })
  test('filter by non-existent tag returns empty', async () => {
    const res = await req(readToken, 'GET', '/api/agent/tasks?tag=nonexistent')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(0)
  })
  test('list response includes tags array', async () => {
    const res = await req(readToken, 'GET', `/api/agent/tasks?tag=backend`)
    const body = await res.json()
    expect(Array.isArray(body.tasks[0].tags)).toBe(true)
    expect(body.tasks[0].tags[0].tag.name).toBe('backend')
  })
})
