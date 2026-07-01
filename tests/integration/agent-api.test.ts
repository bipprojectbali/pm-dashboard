import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { generateProjectToken } from '../../src/lib/project-access-tokens'
import { cleanupTestData, createTestApp, prisma, seedTestProject, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId = ''
let projectId = ''
let otherProjectId = ''
let otherTaskId = ''
let ideaTaskId = ''
let readToken = ''
let writeToken = ''

async function makeToken(pid: string, scope: 'READ' | 'WRITE', opts: { revoked?: boolean; expired?: boolean } = {}) {
  const { raw, hash, prefix } = generateProjectToken()
  await prisma.projectAccessToken.create({
    data: {
      projectId: pid,
      createdById: ownerId,
      name: `${scope}-token`,
      tokenHash: hash,
      tokenPrefix: prefix,
      scope,
      status: opts.revoked ? 'REVOKED' : 'ACTIVE',
      expiresAt: opts.expired ? new Date(Date.now() - 1000) : null,
    },
  })
  return raw
}

function req(token: string | null, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('agent-owner@example.com', 'pass123', 'Agent Owner', 'USER')
  ownerId = owner.id
  projectId = (await seedTestProject(ownerId, 'Agent Test Project')).id
  otherProjectId = (await seedTestProject(ownerId, 'Agent Other Project')).id

  otherTaskId = (
    await prisma.task.create({
      data: { projectId: otherProjectId, reporterId: ownerId, title: 'other', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
    })
  ).id
  ideaTaskId = (
    await prisma.task.create({
      data: { projectId, reporterId: ownerId, title: 'idea', description: '', kind: 'IDEA', status: 'OPEN', priority: 'LOW' },
    })
  ).id

  readToken = await makeToken(projectId, 'READ')
  writeToken = await makeToken(projectId, 'WRITE')
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('auth', () => {
  test('missing token → 401', async () => expect((await req(null, 'GET', '/api/agent/tasks')).status).toBe(401))
  test('non-pmt token → 401', async () => expect((await req('xxx', 'GET', '/api/agent/tasks')).status).toBe(401))
  test('random pmt_ → 401', async () =>
    expect((await req(`pmt_${'a'.repeat(43)}`, 'GET', '/api/agent/tasks')).status).toBe(401))
  test('revoked → 401', async () => {
    const t = await makeToken(projectId, 'READ', { revoked: true })
    expect((await req(t, 'GET', '/api/agent/tasks')).status).toBe(401)
  })
  test('expired → 401', async () => {
    const t = await makeToken(projectId, 'READ', { expired: true })
    expect((await req(t, 'GET', '/api/agent/tasks')).status).toBe(401)
  })
})

describe('READ scope', () => {
  test('lists only the token project tasks', async () => {
    const res = await req(readToken, 'GET', '/api/agent/tasks')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBeGreaterThanOrEqual(1)
    for (const t of body.tasks) expect(t.projectId).toBe(projectId)
  })
  test('get task in another project → 404 (no leak)', async () => {
    const res = await req(readToken, 'GET', `/api/agent/tasks/${otherTaskId}`)
    expect(res.status).toBe(404)
  })
  test('create with READ token → 403', async () => {
    const res = await req(readToken, 'POST', '/api/agent/tasks', { title: 'x', description: 'y' })
    expect(res.status).toBe(403)
  })
})

describe('WRITE scope', () => {
  test('create is scoped to the token project', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 'agent task', description: 'body' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.projectId).toBe(projectId)
  })
  test('missing title/description → 400', async () => {
    expect((await req(writeToken, 'POST', '/api/agent/tasks', { title: 'x' })).status).toBe(400)
  })
  test('update + status transition', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'to move', description: 'b' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${created.task.id}`, { status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.status).toBe('IN_PROGRESS')
  })
  test('invalid transition → 400', async () => {
    // OPEN → READY_FOR_QC is not a valid direct transition for a TASK.
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'bad move', description: 'b' })).json()
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${created.task.id}`, { status: 'READY_FOR_QC' })
    expect(res.status).toBe(400)
  })
  test('comment on own task', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'to comment', description: 'b' })).json()
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${created.task.id}/comments`, { body: 'agent note' })
    expect(res.status).toBe(200)
    expect((await res.json()).comment.authorTag).toBe('AGENT')
  })
  test('checklist add', async () => {
    const created = await (await req(writeToken, 'POST', '/api/agent/tasks', { title: 'to check', description: 'b' })).json()
    const res = await req(writeToken, 'POST', `/api/agent/tasks/${created.task.id}/checklist`, { title: 'step 1' })
    expect(res.status).toBe(200)
    expect((await res.json()).item.title).toBe('step 1')
  })
})

describe('cross-project + IDEA guards', () => {
  test('explicit cross-project id neutralized on create', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', {
      projectId: otherProjectId,
      title: 'sneaky',
      description: 'b',
    })
    expect((await res.json()).task.projectId).toBe(projectId)
  })
  test('update another project task → 404, unchanged', async () => {
    const before = await prisma.task.findUnique({ where: { id: otherTaskId }, select: { title: true } })
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${otherTaskId}`, { title: 'HACKED' })
    expect(res.status).toBe(404)
    const after = await prisma.task.findUnique({ where: { id: otherTaskId }, select: { title: true } })
    expect(after?.title).toBe(before?.title)
  })
  test('create kind=IDEA → 403', async () => {
    const res = await req(writeToken, 'POST', '/api/agent/tasks', { title: 'i', description: 'b', kind: 'IDEA' })
    expect(res.status).toBe(403)
  })
  test('update an IDEA task → 403', async () => {
    const res = await req(writeToken, 'PATCH', `/api/agent/tasks/${ideaTaskId}`, { title: 'x' })
    expect(res.status).toBe(403)
  })
})

describe('llms.txt', () => {
  test('served as text/plain with agent endpoints', async () => {
    const res = await app.handle(new Request('http://localhost/llms.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toContain('/api/agent/tasks')
    expect(text).toContain('Bearer pmt_')
  })
})
