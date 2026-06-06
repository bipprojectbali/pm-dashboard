// Tool-calling helpers untuk Chat AI: definisi tool + executor.
// Setiap tool read-only, hasil di-cap 50 row, error format konsisten.
// Reuse helper di effort.ts / github-summary.ts daripada query ulang.

import { z } from 'zod'
import { prisma } from './db'
import { computeProjectGithubSummary } from './github-summary'
import { effortReport, computePhantomWork, computeTaskEffort } from './effort'

const MAX_ROWS = 50
const MAX_WINDOW_DAYS = 90

// ─── Anthropic tool schema (JSON Schema, not Zod) ────────────────────────────

export interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// ─── Tool definitions exposed to Claude ──────────────────────────────────────

export const CHAT_TOOLS: AnthropicTool[] = [
  {
    name: 'query_users',
    description:
      'Cari & filter user (anggota tim). Pakai untuk pertanyaan tentang siapa, apa role-nya, berapa task open-nya. ' +
      'Hasil maksimal 50 baris. WAJIB dipakai untuk pertanyaan numerik tentang user, jangan tebak dari konteks.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring nama atau email (case-insensitive). Kosongkan untuk semua user.' },
        role: { type: 'string', enum: ['USER', 'QC', 'ADMIN', 'SUPER_ADMIN'], description: 'Filter role.' },
        includeBlocked: { type: 'boolean', description: 'Default false.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
    },
  },
  {
    name: 'query_tasks',
    description:
      'Cari, filter, agregasi task. Mendukung COUNT/SUM via mode="aggregate". Mode="list" return detail task. ' +
      'Pakai untuk: "berapa task X", "total estimasi jam Y", "list task HIGH di proyek Z". ' +
      'Hasil maksimal 50 baris.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['list', 'aggregate'], description: 'list = detail rows; aggregate = count + sumEstimateHours + groupBy.' },
        projectId: { type: 'string' },
        projectName: { type: 'string', description: 'Nama persis atau substring proyek (kalau projectId tidak tahu).' },
        assigneeEmail: { type: 'string' },
        assigneeName: { type: 'string' },
        status: {
          type: 'array',
          items: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] },
        },
        priority: {
          type: 'array',
          items: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
        kind: { type: 'array', items: { type: 'string', enum: ['TASK', 'BUG', 'QC'] } },
        overdueOnly: { type: 'boolean', description: 'Hanya task lewat dueAt & belum CLOSED.' },
        createdSinceDays: { type: 'number', description: 'Hanya task createdAt dalam N hari terakhir.' },
        closedSinceDays: { type: 'number', description: 'Hanya task closedAt dalam N hari terakhir.' },
        groupBy: { type: 'string', enum: ['status', 'priority', 'kind', 'assignee', 'project'], description: 'Hanya untuk mode=aggregate.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'query_project_detail',
    description:
      'Ambil detail lengkap proyek (members, milestones aktif & lewat, extensions, KPI task). ' +
      'Pakai untuk pertanyaan deep tentang satu proyek.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        projectName: { type: 'string', description: 'Substring nama (kalau id tidak tahu).' },
      },
    },
  },
  {
    name: 'query_github_activity',
    description:
      'Aktivitas GitHub: commits + PR + kontributor untuk proyek (dengan repo terlink) atau actor login. ' +
      'Window maks 90 hari. Pakai untuk "siapa commit terbanyak", "berapa PR open di X".',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        projectName: { type: 'string' },
        actorLogin: { type: 'string', description: 'GitHub username untuk filter cross-project.' },
        sinceDays: { type: 'number', description: 'Window N hari terakhir, default 7, maks 90.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
    },
  },
  {
    name: 'query_effort',
    description:
      'Effort tracking dari pm-watch: actualHours per user atau task dalam window. ' +
      'Mode="user": phantom work per user. Mode="task": variance estimate vs actual untuk satu task. ' +
      'Mode="overbudget": list task overbudget/underbudget.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['user', 'task', 'overbudget'] },
        userEmail: { type: 'string', description: 'Untuk mode=user, filter satu user.' },
        taskId: { type: 'string', description: 'Untuk mode=task.' },
        projectId: { type: 'string', description: 'Untuk mode=overbudget filter ke satu proyek.' },
        sinceDays: { type: 'number', description: 'Window hari, default 7 (mode=user), maks 90.' },
        verdict: { type: 'string', enum: ['over', 'under', 'both'], description: 'Untuk mode=overbudget. Default both.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
      required: ['mode'],
    },
  },
]

// ─── Zod schemas untuk validasi runtime ─────────────────────────────────────

const QueryUsersInput = z.object({
  query: z.string().optional(),
  role: z.enum(['USER', 'QC', 'ADMIN', 'SUPER_ADMIN']).optional(),
  includeBlocked: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

const QueryTasksInput = z.object({
  mode: z.enum(['list', 'aggregate']),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  assigneeEmail: z.string().optional(),
  assigneeName: z.string().optional(),
  status: z.array(z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'])).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).optional(),
  kind: z.array(z.enum(['TASK', 'BUG', 'QC'])).optional(),
  overdueOnly: z.boolean().optional(),
  createdSinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  closedSinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  groupBy: z.enum(['status', 'priority', 'kind', 'assignee', 'project']).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

const QueryProjectDetailInput = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
})

const QueryGithubInput = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  actorLogin: z.string().optional(),
  sinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

const QueryEffortInput = z.object({
  mode: z.enum(['user', 'task', 'overbudget']),
  userEmail: z.string().optional(),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  sinceDays: z.number().int().min(1).max(MAX_WINDOW_DAYS).optional(),
  verdict: z.enum(['over', 'under', 'both']).optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
})

// ─── Executor ───────────────────────────────────────────────────────────────

export interface ToolResult {
  ok: boolean
  error?: string
  rows?: unknown[]
  summary?: Record<string, unknown>
  truncated?: boolean
}

export async function executeChatTool(name: string, rawInput: unknown): Promise<ToolResult> {
  try {
    switch (name) {
      case 'query_users':
        return await runQueryUsers(QueryUsersInput.parse(rawInput))
      case 'query_tasks':
        return await runQueryTasks(QueryTasksInput.parse(rawInput))
      case 'query_project_detail':
        return await runQueryProjectDetail(QueryProjectDetailInput.parse(rawInput))
      case 'query_github_activity':
        return await runQueryGithub(QueryGithubInput.parse(rawInput))
      case 'query_effort':
        return await runQueryEffort(QueryEffortInput.parse(rawInput))
      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: `Invalid input: ${e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─── Tool: query_users ──────────────────────────────────────────────────────

async function runQueryUsers(input: z.infer<typeof QueryUsersInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const now = new Date()
  const where: Record<string, unknown> = {}
  if (!input.includeBlocked) where.blocked = false
  if (input.role) where.role = input.role
  if (input.query) {
    where.OR = [
      { name: { contains: input.query, mode: 'insensitive' } },
      { email: { contains: input.query, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.user.count({ where })
  const users = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: { name: 'asc' },
    include: {
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, dueAt: true, estimateHours: true, priority: true },
      },
      _count: { select: { projectMemberships: true } },
    },
  })

  const rows = users.map((u) => {
    const open = u.assignedTasks.length
    const overdue = u.assignedTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now).length
    const estimateTotal = u.assignedTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      blocked: u.blocked,
      projectCount: u._count.projectMemberships,
      openTasks: open,
      overdueTasks: overdue,
      sumEstimateHours: Math.round(estimateTotal * 10) / 10,
    }
  })

  return {
    ok: true,
    rows,
    summary: { total, returned: rows.length },
    truncated: total > rows.length,
  }
}

// ─── Tool: query_tasks ──────────────────────────────────────────────────────

async function runQueryTasks(input: z.infer<typeof QueryTasksInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const now = new Date()

  // Resolve projectId from projectName if given
  let projectId = input.projectId
  if (!projectId && input.projectName) {
    const p = await prisma.project.findFirst({
      where: { name: { contains: input.projectName, mode: 'insensitive' } },
      select: { id: true },
    })
    projectId = p?.id
    if (!projectId) return { ok: true, rows: [], summary: { total: 0, note: `Proyek "${input.projectName}" tidak ditemukan` } }
  }

  // Resolve assigneeId
  let assigneeId: string | undefined
  if (input.assigneeEmail || input.assigneeName) {
    const a = await prisma.user.findFirst({
      where: input.assigneeEmail
        ? { email: input.assigneeEmail }
        : { name: { contains: input.assigneeName!, mode: 'insensitive' } },
      select: { id: true },
    })
    assigneeId = a?.id
    if (!assigneeId) return { ok: true, rows: [], summary: { total: 0, note: `User "${input.assigneeEmail ?? input.assigneeName}" tidak ditemukan` } }
  }

  const where: Record<string, unknown> = { deletedAt: null }
  if (projectId) where.projectId = projectId
  if (assigneeId) where.assigneeId = assigneeId
  if (input.status?.length) where.status = { in: input.status }
  if (input.priority?.length) where.priority = { in: input.priority }
  if (input.kind?.length) where.kind = { in: input.kind }
  if (input.overdueOnly) {
    where.status = { notIn: ['CLOSED'] }
    where.dueAt = { lt: now }
  }
  if (input.createdSinceDays) {
    where.createdAt = { gte: new Date(now.getTime() - input.createdSinceDays * 86_400_000) }
  }
  if (input.closedSinceDays) {
    where.closedAt = { gte: new Date(now.getTime() - input.closedSinceDays * 86_400_000) }
  }

  const total = await prisma.task.count({ where })

  if (input.mode === 'aggregate') {
    const all = await prisma.task.findMany({
      where,
      select: {
        status: true,
        priority: true,
        kind: true,
        estimateHours: true,
        assignee: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    })
    const sumEstimate = all.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    const counts: Record<string, { count: number; sumEstimateHours: number }> = {}
    const groupKey = (t: typeof all[number]): string => {
      switch (input.groupBy) {
        case 'status': return t.status
        case 'priority': return t.priority
        case 'kind': return t.kind
        case 'assignee': return t.assignee?.email ?? '(unassigned)'
        case 'project': return t.project?.name ?? '?'
        default: return '_total'
      }
    }
    for (const t of all) {
      const k = groupKey(t)
      const bucket = counts[k] ?? { count: 0, sumEstimateHours: 0 }
      bucket.count += 1
      bucket.sumEstimateHours += t.estimateHours ?? 0
      counts[k] = bucket
    }
    const rows = Object.entries(counts)
      .map(([key, v]) => ({ key, count: v.count, sumEstimateHours: Math.round(v.sumEstimateHours * 10) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    return {
      ok: true,
      rows,
      summary: {
        total,
        sumEstimateHours: Math.round(sumEstimate * 10) / 10,
        groupBy: input.groupBy ?? '_total',
      },
    }
  }

  // mode = list
  const tasks = await prisma.task.findMany({
    where,
    take: limit,
    orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    include: {
      assignee: { select: { name: true, email: true } },
      project: { select: { name: true } },
    },
  })

  const rows = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    kind: t.kind,
    project: t.project?.name ?? null,
    assignee: t.assignee?.email ?? null,
    dueAt: t.dueAt,
    estimateHours: t.estimateHours,
    overdue: t.dueAt ? new Date(t.dueAt) < now && t.status !== 'CLOSED' : false,
  }))

  return { ok: true, rows, summary: { total, returned: rows.length }, truncated: total > rows.length }
}

// ─── Tool: query_project_detail ─────────────────────────────────────────────

async function runQueryProjectDetail(input: z.infer<typeof QueryProjectDetailInput>): Promise<ToolResult> {
  if (!input.projectId && !input.projectName) {
    return { ok: false, error: 'Wajib isi projectId atau projectName' }
  }

  const project = await prisma.project.findFirst({
    where: input.projectId
      ? { id: input.projectId }
      : { name: { contains: input.projectName!, mode: 'insensitive' } },
    include: {
      owner: { select: { name: true, email: true } },
      members: { include: { user: { select: { name: true, email: true, role: true } } } },
      milestones: { orderBy: { dueAt: 'asc' } },
      extensions: {
        orderBy: { createdAt: 'desc' },
        include: { extendedBy: { select: { name: true } } },
      },
      _count: { select: { tasks: true } },
    },
  })
  if (!project) return { ok: true, rows: [], summary: { note: 'Proyek tidak ditemukan' } }

  const now = new Date()
  const taskBreakdown = await prisma.task.groupBy({
    by: ['status'],
    where: { projectId: project.id, deletedAt: null },
    _count: { _all: true },
  })
  const overdueCount = await prisma.task.count({
    where: { projectId: project.id, deletedAt: null, status: { notIn: ['CLOSED'] }, dueAt: { lt: now } },
  })

  return {
    ok: true,
    rows: [
      {
        id: project.id,
        name: project.name,
        status: project.status,
        priority: project.priority,
        owner: project.owner,
        startsAt: project.startsAt,
        endsAt: project.endsAt,
        originalEndAt: project.originalEndAt,
        archivedAt: project.archivedAt,
        githubRepo: project.githubRepo,
        description: project.description,
        members: project.members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
        milestones: project.milestones.map((m) => ({
          title: m.title,
          dueAt: m.dueAt,
          completedAt: m.completedAt,
          overdue: m.dueAt ? new Date(m.dueAt) < now && !m.completedAt : false,
        })),
        extensions: project.extensions.map((e) => ({
          previousEndAt: e.previousEndAt,
          newEndAt: e.newEndAt,
          reason: e.reason,
          extendedBy: e.extendedBy?.name ?? null,
          createdAt: e.createdAt,
        })),
        taskTotal: project._count.tasks,
        taskBreakdown: Object.fromEntries(taskBreakdown.map((b) => [b.status, b._count._all])),
        overdueTasks: overdueCount,
      },
    ],
  }
}

// ─── Tool: query_github_activity ────────────────────────────────────────────

async function runQueryGithub(input: z.infer<typeof QueryGithubInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20
  const sinceDays = input.sinceDays ?? 7
  const since = new Date(Date.now() - sinceDays * 86_400_000)

  // Path 1: project-scoped summary (delegate to existing helper for accuracy)
  if (input.projectId || input.projectName) {
    let projectId = input.projectId
    if (!projectId && input.projectName) {
      const p = await prisma.project.findFirst({
        where: { name: { contains: input.projectName, mode: 'insensitive' } },
        select: { id: true },
      })
      projectId = p?.id
      if (!projectId) return { ok: true, rows: [], summary: { note: 'Proyek tidak ditemukan' } }
    }
    const summary = await computeProjectGithubSummary(projectId!)
    if (!summary || !summary.linked) {
      return { ok: true, rows: [], summary: { note: 'Proyek belum terhubung ke GitHub repo' } }
    }
    return {
      ok: true,
      rows: summary.recent.slice(0, limit).map((e) => ({
        kind: e.kind,
        actor: e.matchedUser?.name ?? e.actorLogin,
        title: e.title,
        url: e.url,
        prNumber: e.prNumber,
        createdAt: e.createdAt,
      })),
      summary: {
        repo: summary.repo,
        commits7d: summary.stats.commits7d,
        commits30d: summary.stats.commits30d,
        contributors30d: summary.stats.contributors30d,
        openPrs: summary.stats.openPrs,
        topContributors: summary.contributors.slice(0, 10),
      },
    }
  }

  // Path 2: actor-scoped (commits per project for one GitHub user)
  if (input.actorLogin) {
    const events = await prisma.projectGithubEvent.findMany({
      where: { actorLogin: input.actorLogin, kind: 'PUSH_COMMIT', createdAt: { gte: since } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    const byProject = new Map<string, number>()
    for (const e of events) byProject.set(e.project.name, (byProject.get(e.project.name) ?? 0) + 1)
    return {
      ok: true,
      rows: events.map((e) => ({
        kind: e.kind,
        project: e.project.name,
        title: e.title,
        url: e.url,
        createdAt: e.createdAt,
      })),
      summary: {
        actorLogin: input.actorLogin,
        sinceDays,
        totalCommits: events.length,
        byProject: Object.fromEntries(byProject),
      },
    }
  }

  // Path 3: global top contributors
  const contributors = await prisma.projectGithubEvent.groupBy({
    by: ['actorLogin'],
    where: { kind: 'PUSH_COMMIT', createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { actorLogin: 'desc' } },
    take: limit,
  })
  return {
    ok: true,
    rows: contributors.map((c) => ({ actorLogin: c.actorLogin, commits: c._count._all })),
    summary: { sinceDays, scope: 'global' },
  }
}

// ─── Tool: query_effort ─────────────────────────────────────────────────────

async function runQueryEffort(input: z.infer<typeof QueryEffortInput>): Promise<ToolResult> {
  const limit = input.limit ?? 20

  if (input.mode === 'task') {
    if (!input.taskId) return { ok: false, error: 'mode=task butuh taskId' }
    const eff = await computeTaskEffort(input.taskId)
    if (!eff) return { ok: true, rows: [], summary: { note: 'Task tidak ditemukan' } }
    return { ok: true, rows: [eff] }
  }

  if (input.mode === 'user') {
    const days = input.sinceDays ?? 7
    const phantom = await computePhantomWork({ days, limit: MAX_ROWS })
    let rows = phantom
    if (input.userEmail) {
      rows = rows.filter((r) => r.email.toLowerCase() === input.userEmail!.toLowerCase())
    }
    return {
      ok: true,
      rows: rows.slice(0, limit),
      summary: { sinceDays: days, totalUsers: phantom.length },
    }
  }

  // mode = overbudget
  const all = await effortReport({ onlyClosed: false, limit: MAX_ROWS, projectId: input.projectId })
  const verdict = input.verdict ?? 'both'
  const filtered = all.filter((r) => {
    if (verdict === 'over') return r.verdict === 'over'
    if (verdict === 'under') return r.verdict === 'under'
    return r.verdict === 'over' || r.verdict === 'under'
  })
  return {
    ok: true,
    rows: filtered.slice(0, limit),
    summary: {
      totalOver: all.filter((r) => r.verdict === 'over').length,
      totalUnder: all.filter((r) => r.verdict === 'under').length,
    },
  }
}
