import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CHAT_TOOLS, executeChatTool } from '../../src/lib/chat-tools'
import { prisma } from '../../src/lib/db'

const TEST_PREFIX = '__chat_tools_test__'

let testUserId: string
let testProjectId: string
let testTaskId: string

beforeAll(async () => {
  const hashed = await Bun.password.hash('test123', { algorithm: 'bcrypt' })
  const user = await prisma.user.create({
    data: { email: `${TEST_PREFIX}user@example.com`, name: `${TEST_PREFIX}Alice`, password: hashed, role: 'USER' },
  })
  testUserId = user.id

  const project = await prisma.project.create({
    data: { name: `${TEST_PREFIX}Apollo`, ownerId: user.id, status: 'ACTIVE', priority: 'HIGH' },
  })
  testProjectId = project.id

  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: 'OWNER' } })

  // Overdue task assigned to test user
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      kind: 'TASK',
      title: `${TEST_PREFIX}Overdue task`,
      description: 'test fixture',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      reporterId: user.id,
      assigneeId: user.id,
      estimateHours: 8,
      dueAt: new Date(Date.now() - 86_400_000 * 3),
    },
  })
  testTaskId = task.id
})

afterAll(async () => {
  await prisma.taskDependency.deleteMany({ where: { task: { title: { startsWith: TEST_PREFIX } } } })
  await prisma.task.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } })
  await prisma.projectMember.deleteMany({ where: { project: { name: { startsWith: TEST_PREFIX } } } })
  await prisma.project.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
})

describe('CHAT_TOOLS definitions', () => {
  test('exposes 5 tools', () => {
    expect(CHAT_TOOLS).toHaveLength(5)
    const names = CHAT_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual([
      'query_effort',
      'query_github_activity',
      'query_project_detail',
      'query_tasks',
      'query_users',
    ])
  })

  test('every tool has Anthropic-shaped input_schema', () => {
    for (const t of CHAT_TOOLS) {
      expect(t.input_schema.type).toBe('object')
      expect(typeof t.input_schema.properties).toBe('object')
      expect(t.description.length).toBeGreaterThan(20)
    }
  })
})

describe('executeChatTool dispatch', () => {
  test('rejects unknown tool', async () => {
    const r = await executeChatTool('nope', {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Unknown tool')
  })

  test('returns Zod error on invalid input', async () => {
    const r = await executeChatTool('query_tasks', { mode: 'wrong' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Invalid input')
  })
})

describe('query_users', () => {
  test('finds user by partial name match', async () => {
    const r = await executeChatTool('query_users', { query: `${TEST_PREFIX}Alice` })
    expect(r.ok).toBe(true)
    expect(r.rows!.length).toBeGreaterThan(0)
    const found = r.rows!.find((u) => (u as { id: string }).id === testUserId) as { openTasks: number; overdueTasks: number; sumEstimateHours: number } | undefined
    expect(found).toBeDefined()
    expect(found!.openTasks).toBeGreaterThanOrEqual(1)
    expect(found!.overdueTasks).toBeGreaterThanOrEqual(1)
    expect(found!.sumEstimateHours).toBeGreaterThanOrEqual(8)
  })

  test('filters by role', async () => {
    const r = await executeChatTool('query_users', { role: 'USER', limit: 50 })
    expect(r.ok).toBe(true)
    for (const u of r.rows as Array<{ role: string }>) {
      expect(u.role).toBe('USER')
    }
  })
})

describe('query_tasks', () => {
  test('list mode returns enriched task rows', async () => {
    const r = await executeChatTool('query_tasks', { mode: 'list', projectId: testProjectId })
    expect(r.ok).toBe(true)
    const t = r.rows!.find((x) => (x as { id: string }).id === testTaskId) as { overdue: boolean; status: string }
    expect(t).toBeDefined()
    expect(t.overdue).toBe(true)
    expect(t.status).toBe('IN_PROGRESS')
  })

  test('aggregate mode groups by status', async () => {
    const r = await executeChatTool('query_tasks', {
      mode: 'aggregate',
      projectId: testProjectId,
      groupBy: 'status',
    })
    expect(r.ok).toBe(true)
    expect((r.summary as { groupBy: string }).groupBy).toBe('status')
    const inProgress = r.rows!.find((x) => (x as { key: string }).key === 'IN_PROGRESS') as { count: number; sumEstimateHours: number }
    expect(inProgress).toBeDefined()
    expect(inProgress.count).toBeGreaterThanOrEqual(1)
    expect(inProgress.sumEstimateHours).toBeGreaterThanOrEqual(8)
  })

  test('overdueOnly filter narrows result', async () => {
    const r = await executeChatTool('query_tasks', { mode: 'list', overdueOnly: true })
    expect(r.ok).toBe(true)
    for (const t of r.rows as Array<{ overdue: boolean; status: string }>) {
      expect(t.overdue).toBe(true)
      expect(t.status).not.toBe('CLOSED')
    }
  })

  test('returns helpful note for unknown project name', async () => {
    const r = await executeChatTool('query_tasks', { mode: 'list', projectName: '___does_not_exist___' })
    expect(r.ok).toBe(true)
    expect((r.summary as { note?: string }).note).toContain('tidak ditemukan')
  })
})

describe('query_project_detail', () => {
  test('returns full detail when found', async () => {
    const r = await executeChatTool('query_project_detail', { projectId: testProjectId })
    expect(r.ok).toBe(true)
    expect(r.rows).toHaveLength(1)
    const p = r.rows![0] as { id: string; members: Array<{ email: string }>; taskBreakdown: Record<string, number>; overdueTasks: number }
    expect(p.id).toBe(testProjectId)
    expect(p.members.length).toBeGreaterThanOrEqual(1)
    expect(p.taskBreakdown.IN_PROGRESS).toBeGreaterThanOrEqual(1)
    expect(p.overdueTasks).toBeGreaterThanOrEqual(1)
  })

  test('rejects when both ids absent', async () => {
    const r = await executeChatTool('query_project_detail', {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('projectId')
  })

  test('returns note when project not found', async () => {
    const r = await executeChatTool('query_project_detail', { projectName: '___no_such_project___' })
    expect(r.ok).toBe(true)
    expect((r.summary as { note?: string }).note).toContain('tidak ditemukan')
  })
})

describe('query_github_activity', () => {
  test('returns empty + note when project has no GitHub link', async () => {
    const r = await executeChatTool('query_github_activity', { projectId: testProjectId, sinceDays: 7 })
    expect(r.ok).toBe(true)
    expect((r.summary as { note?: string }).note).toContain('GitHub')
  })

  test('global path returns array (may be empty)', async () => {
    const r = await executeChatTool('query_github_activity', { sinceDays: 7 })
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.rows)).toBe(true)
  })
})

describe('query_effort', () => {
  test('mode=task requires taskId', async () => {
    const r = await executeChatTool('query_effort', { mode: 'task' })
    expect(r.ok).toBe(false)
  })

  test('mode=user returns array', async () => {
    const r = await executeChatTool('query_effort', { mode: 'user', sinceDays: 7 })
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.rows)).toBe(true)
  })

  test('mode=overbudget returns array', async () => {
    const r = await executeChatTool('query_effort', { mode: 'overbudget', verdict: 'over' })
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.rows)).toBe(true)
  })
})
