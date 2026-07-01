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

function mcp(rawToken: string | null, method: string, params: unknown) {
  return app.handle(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        ...(rawToken ? { Authorization: `Bearer ${rawToken}` } : {}),
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  )
}

const callTool = (rawToken: string, name: string, args: Record<string, unknown>) =>
  mcp(rawToken, 'tools/call', { name, arguments: args })

// Extract the tool result text from a JSON-RPC response body (single read).
function resultText(j: { result?: { content?: Array<{ text?: string }> } }): string {
  return j?.result?.content?.[0]?.text ?? JSON.stringify(j)
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('mcp-owner@example.com', 'pass123', 'MCP Owner', 'USER')
  ownerId = owner.id
  const project = await seedTestProject(ownerId, 'MCP Test Project')
  projectId = project.id
  const other = await seedTestProject(ownerId, 'MCP Other Project')
  otherProjectId = other.id

  const otherTask = await prisma.task.create({
    data: { projectId: otherProjectId, reporterId: ownerId, title: 'other task', description: '', kind: 'TASK', status: 'OPEN', priority: 'MEDIUM' },
  })
  otherTaskId = otherTask.id
  const idea = await prisma.task.create({
    data: { projectId, reporterId: ownerId, title: 'an idea', description: '', kind: 'IDEA', status: 'OPEN', priority: 'LOW' },
  })
  ideaTaskId = idea.id

  readToken = await makeToken(projectId, 'READ')
  writeToken = await makeToken(projectId, 'WRITE')
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('auth', () => {
  test('missing Authorization → 401', async () => {
    const res = await mcp(null, 'tools/list', {})
    expect(res.status).toBe(401)
  })
  test('non-pmt bearer → 401', async () => {
    const res = await mcp('not-a-pmt-token', 'tools/list', {})
    expect(res.status).toBe(401)
  })
  test('random pmt_ → 401', async () => {
    const res = await mcp(`pmt_${'a'.repeat(43)}`, 'tools/list', {})
    expect(res.status).toBe(401)
  })
  test('revoked token → 401', async () => {
    const revoked = await makeToken(projectId, 'READ', { revoked: true })
    const res = await mcp(revoked, 'tools/list', {})
    expect(res.status).toBe(401)
  })
  test('expired token → 401', async () => {
    const expired = await makeToken(projectId, 'READ', { expired: true })
    const res = await mcp(expired, 'tools/list', {})
    expect(res.status).toBe(401)
  })
})

describe('tools/list reflects scope', () => {
  test('READ lists only task_list + task_get', async () => {
    const res = await mcp(readToken, 'tools/list', {})
    const j = await res.json()
    const names = (j.result.tools as Array<{ name: string }>).map((t) => t.name).sort()
    expect(names).toEqual(['task_get', 'task_list'])
  })
  test('WRITE lists the write set incl. task_create', async () => {
    const res = await mcp(writeToken, 'tools/list', {})
    const j = await res.json()
    const names = (j.result.tools as Array<{ name: string }>).map((t) => t.name)
    expect(names).toContain('task_create')
    expect(names).toContain('task_update')
    expect(names).toContain('task_checklist_add')
  })
  test('projectId is stripped from task_create schema', async () => {
    const res = await mcp(writeToken, 'tools/list', {})
    const j = await res.json()
    const create = (j.result.tools as Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }>).find(
      (t) => t.name === 'task_create',
    )
    expect(create?.inputSchema.properties && 'projectId' in create.inputSchema.properties).toBe(false)
  })
})

describe('READ scope', () => {
  test('task_list returns only the token project tasks', async () => {
    const res = await callTool(readToken, 'task_list', {})
    const body = JSON.parse(resultText(await res.json()))
    expect(body.count).toBeGreaterThanOrEqual(1)
    for (const t of body.tasks) expect(t.projectId).toBe(projectId)
  })
  test('task_get on another project task → not found (no leak)', async () => {
    const res = await callTool(readToken, 'task_get', { taskId: otherTaskId })
    const j = await res.json()
    expect(j.result.isError).toBe(true)
    expect(j.result.content[0].text).toContain('not found')
  })
})

describe('WRITE scope', () => {
  test('task_create succeeds and is scoped to the token project', async () => {
    const res = await callTool(writeToken, 'task_create', {
      title: 'created via token',
      description: 'body',
      reporterEmail: 'mcp-owner@example.com',
    })
    const body = JSON.parse(resultText(await res.json()))
    expect(body.ok).toBe(true)
    expect(body.task.projectId).toBe(projectId)
  })
  test('explicit cross-project projectId is neutralized', async () => {
    const res = await callTool(writeToken, 'task_create', {
      projectId: otherProjectId,
      title: 'sneaky cross-project',
      description: 'body',
      reporterEmail: 'mcp-owner@example.com',
    })
    const body = JSON.parse(resultText(await res.json()))
    expect(body.ok).toBe(true)
    expect(body.task.projectId).toBe(projectId) // forced back to token project
  })
  test('task_update on another project task → rejected, unchanged', async () => {
    const before = await prisma.task.findUnique({ where: { id: otherTaskId }, select: { title: true } })
    const res = await callTool(writeToken, 'task_update', { taskId: otherTaskId, title: 'HACKED' })
    const j = await res.json()
    expect(j.result.isError).toBe(true)
    const after = await prisma.task.findUnique({ where: { id: otherTaskId }, select: { title: true } })
    expect(after?.title).toBe(before?.title)
  })
})

describe('IDEA read-only', () => {
  test('task_create kind=IDEA → rejected', async () => {
    const res = await callTool(writeToken, 'task_create', {
      title: 'idea via token',
      description: 'body',
      reporterEmail: 'mcp-owner@example.com',
      kind: 'IDEA',
    })
    const j = await res.json()
    expect(j.result.isError).toBe(true)
    expect(j.result.content[0].text).toContain('read-only')
  })
  test('task_update on an IDEA task → rejected', async () => {
    const res = await callTool(writeToken, 'task_update', { taskId: ideaTaskId, title: 'changed' })
    const j = await res.json()
    expect(j.result.isError).toBe(true)
  })
})
