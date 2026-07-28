import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generateProjectToken } from '../../src/lib/project-access-tokens'
import { createTestApp, prisma } from '../helpers'

// Detail + robustness half of the agent REST surface (rich task detail, project
// metadata, 400-not-500 input validation, enum case-insensitivity, dependency
// detail, checklist update/delete, guide). Split from agent-api.test.ts to keep
// each file within the test file-size limit. Self-contained with an email-
// anchored seed + cleanup (no cleanupTestData) so it never nukes sibling data.
const app = createTestApp()

let ownerId = ''
let projectId = ''
let otherProjectId = ''
let otherTaskId = ''
let readToken = ''
let writeToken = ''

async function makeToken(pid: string, scope: 'READ' | 'WRITE') {
  const { raw, hash, prefix } = generateProjectToken()
  await prisma.projectAccessToken.create({
    data: { projectId: pid, createdById: ownerId, name: `detail-${scope}`, tokenHash: hash, tokenPrefix: prefix, scope, status: 'ACTIVE' },
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
  // Unique email anchor to avoid conflicts with agent-api.test.ts; that file owns
  // the global cleanupTestData timing.
  const hash = await Bun.password.hash('pass123', { algorithm: 'bcrypt' })
  const owner = await prisma.user.upsert({
    where: { email: 'agent-detail@example.com' },
    update: {},
    create: { email: 'agent-detail@example.com', name: 'Agent Detail', password: hash, role: 'USER' },
  })
  ownerId = owner.id

  const proj = await prisma.project.create({
    data: { name: 'Agent Detail Project', ownerId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE', members: { create: { userId: ownerId, role: 'OWNER' } } },
  })
  projectId = proj.id
  const otherProj = await prisma.project.create({
    data: { name: 'Agent Detail Other', ownerId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE', members: { create: { userId: ownerId, role: 'OWNER' } } },
  })
  otherProjectId = otherProj.id

  otherTaskId = (
    await prisma.task.create({
      data: { projectId: otherProjectId, reporterId: ownerId, title: 'other', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
  ).id

  readToken = await makeToken(projectId, 'READ')
  writeToken = await makeToken(projectId, 'WRITE')
})

afterAll(async () => {
  // Clean up only our data by email anchor to avoid nuking parallel test data.
  const user = await prisma.user.findUnique({ where: { email: 'agent-detail@example.com' } })
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

describe('GET /api/agent/tasks/:id rich detail', () => {
  test('happy path returns comments, evidence, statusChanges, checklist with ids', async () => {
    const task = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'rich', description: 'x', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
    await prisma.taskComment.create({ data: { taskId: task.id, authorId: ownerId, authorTag: 'AGENT', body: 'a note' } })
    await prisma.taskEvidence.create({ data: { taskId: task.id, kind: 'LINK', url: 'https://e.example', note: 'see this' } })
    await prisma.taskStatusChange.create({ data: { taskId: task.id, authorId: ownerId, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS' } })
    await prisma.taskChecklistItem.create({ data: { taskId: task.id, title: 'step A', order: 0 } })

    const res = await req(readToken, 'GET', `/api/agent/tasks/${task.id}`)
    expect(res.status).toBe(200)
    const { task: t } = await res.json()
    expect(t.comments[0].body).toBe('a note')
    expect(t.evidence[0].url).toBe('https://e.example')
    expect(t.statusChanges[0].toStatus).toBe('IN_PROGRESS')
    expect(t.checklist[0].id).toBeTruthy()
    expect(t.checklist[0].title).toBe('step A')
  })
})

describe('GET /api/agent/project', () => {
  test('returns token project metadata with members', async () => {
    const res = await req(readToken, 'GET', '/api/agent/project')
    expect(res.status).toBe(200)
    const { project } = await res.json()
    expect(project.id).toBe(projectId)
    expect(project.name).toBe('Agent Detail Project')
    expect(project.members.some((m: { user: { id: string } }) => m.user.id === ownerId)).toBe(true)
    expect(Array.isArray(project.phases)).toBe(true)
    expect(Array.isArray(project.milestones)).toBe(true)
  })
})

describe('robustness: 400 not 500', () => {
  test('malformed JSON body → 400', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/agent/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${writeToken}`, 'Content-Type': 'application/json' },
        body: '{ not valid json',
      }),
    )
    expect(res.status).toBe(400)
  })
  test('invalid kind on create → 400 (not 500)', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 't', description: 'd', kind: 'GARBAGE' })
    expect(res.status).toBe(400)
  })
  test('invalid priority on create → 400', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 't', description: 'd', priority: 'SUPER' })
    expect(res.status).toBe(400)
  })
  test('invalid priority on update → 400', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'p', description: 'd' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${created.task.id}`, { priority: 'SUPER' })
    expect(res.status).toBe(400)
  })
  test('invalid dueAt string on create → 400 (not 500)', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 't', description: 'd', dueAt: 'garbage' })
    expect(res.status).toBe(400)
  })
  test('invalid dueAt string on update → 400', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'due', description: 'd' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${created.task.id}`, { dueAt: 'not-a-date' })
    expect(res.status).toBe(400)
  })
  test('non-numeric estimateHours on update → 400 (not 500)', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'est', description: 'd' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${created.task.id}`, { estimateHours: 'five' })
    expect(res.status).toBe(400)
  })
  test('numeric-string estimateHours is coerced, not rejected', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 'coerce', description: 'd', estimateHours: '5' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.estimateHours).toBe(5)
  })
  test('checklist update with wrong-typed done → 400 (not 500)', async () => {
    const t = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'ck', description: 'd' })).json()
    const item = await (await req(writeToken, 'POST', `/api/agent/tasks/${t.task.id}/checklist`, { title: 'x' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/checklist/${item.item.id}`, { done: 'yes' })
    expect(res.status).toBe(400)
  })
})

describe('enum case-insensitivity + list filters', () => {
  test('lowercase kind filter is accepted', async () => {
    const res = await req(readToken, 'GET', '/api/agent/tasks?kind=task')
    expect(res.status).toBe(200)
  })
  test('lowercase status filter is accepted', async () => {
    const res = await req(readToken, 'GET', '/api/agent/tasks?status=open')
    expect(res.status).toBe(200)
  })
  test('priority filter narrows results', async () => {
    await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'crit-filter', description: 'd', kind: 'TASK', status: 'OPEN', priority: 'CRITICAL' },
    })
    const res = await req(readToken, 'GET', '/api/agent/tasks?priority=critical&limit=200')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks.length).toBeGreaterThanOrEqual(1)
    for (const t of body.tasks) expect(t.priority).toBe('CRITICAL')
  })
  test('search filter matches title substring', async () => {
    await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'UNIQUENEEDLE task', description: 'd', kind: 'TASK', status: 'OPEN', priority: 'LOW' },
    })
    const res = await req(readToken, 'GET', '/api/agent/tasks?search=uniqueneedle')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks.some((t: { title: string }) => t.title.includes('UNIQUENEEDLE'))).toBe(true)
  })
  test('lowercase kind on create is accepted + normalized', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 'lk', description: 'd', kind: 'bug' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.kind).toBe('BUG')
  })
})

describe('detail includes tags + dependencies', () => {
  test('tags and blockedBy/blocks with linked task info are returned', async () => {
    const a = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'blocker', description: 'd', kind: 'TASK', status: 'OPEN', priority: 'LOW' },
    })
    const b = await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'blocked', description: 'd', kind: 'TASK', status: 'OPEN', priority: 'LOW' },
    })
    await prisma.taskDependency.create({ data: { taskId: b.id, blockedById: a.id } })
    const tag = await prisma.tag.create({ data: { projectId, name: 'urgent', color: 'red' } })
    await prisma.taskTag.create({ data: { taskId: b.id, tagId: tag.id } })

    const res = await req(readToken, 'GET', `/api/agent/tasks/${b.id}`)
    expect(res.status).toBe(200)
    const { task } = await res.json()
    expect(task.tags[0].tag.name).toBe('urgent')
    expect(task.blockedBy[0].blockedBy.title).toBe('blocker')
    expect(task.blockedBy[0].blockedBy.status).toBe('OPEN')
  })
})

describe('checklist update + delete', () => {
  test('update then delete a checklist item; cross-project item → 404', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'cl', description: 'd' })).json()
    const added = await (await req(writeToken, 'POST', `/api/agent/tasks/${created.task.id}/checklist`, { title: 'todo' })).json()
    const itemId = added.item.id
    const upd = await req(writeToken, 'PATCH', `/api/agent/checklist/${itemId}`, { done: true })
    expect(upd.status).toBe(200)
    expect((await upd.json()).item.done).toBe(true)
    // cross-project item id → 404 (seed an item in the other project)
    const otherItem = await prisma.taskChecklistItem.create({ data: { taskId: otherTaskId, title: 'x', order: 0 } })
    expect((await req(writeToken, 'PATCH', `/api/agent/checklist/${otherItem.id}`, { done: true })).status).toBe(404)
    const del = await req(writeToken, 'DELETE', `/api/agent/checklist/${itemId}`)
    expect(del.status).toBe(200)
    expect(await prisma.taskChecklistItem.findUnique({ where: { id: itemId } })).toBeNull()
  })
})

describe('GET /api/agent/guide (auth-gated)', () => {
  test('anonymous → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/agent/guide'))
    expect(res.status).toBe(401)
  })
  test('with token → 200 text/plain with agent endpoints', async () => {
    const res = await req(readToken, 'GET', '/api/agent/guide')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toContain('/api/agent/tasks')
    expect(text).toContain('Bearer pmt_')
  })
  test('old /llms.txt and /llms-agent.txt are gone → not 200', async () => {
    expect((await app.handle(new Request('http://localhost/llms.txt'))).status).not.toBe(200)
    expect((await app.handle(new Request('http://localhost/llms-agent.txt'))).status).not.toBe(200)
  })
})
