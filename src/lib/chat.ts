import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { CHAT_TOOLS, executeChatTool } from './chat-tools'
import { searchDocuments, type DocHit } from './chat-documents'
import { prisma } from './db'
import { computePhantomWork, detectGhostTasks, effortReport } from './effort'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSource {
  ref: string
  type: string
  entityId: string
  title: string
}

export interface ChatStreamParams {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  systemContext: string
  messages: ChatMessage[]
  relevantDocs?: string
  sources?: ChatSource[]
}

// ─── Context builder (Fase A — enriched) ─────────────────────────────────────

export async function buildChatContext(): Promise<string> {
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [overview, health, load, risk, events, recentActivity, topOverdue] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 20 }),
    computeTeamLoad({ includeUnassigned: false, limit: 30 }),
    computeRiskReport(),
    prisma.event.findMany({
      where: { startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      include: { tags: { include: { tag: { select: { name: true } } } } },
    }),
    Promise.all([
      prisma.taskStatusChange.findMany({
        where: { createdAt: { gte: since7d } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          task: { select: { title: true, project: { select: { name: true } } } },
          author: { select: { name: true } },
        },
      }),
      prisma.taskComment.findMany({
        where: { createdAt: { gte: since7d } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          task: { select: { title: true, project: { select: { name: true } } } },
          author: { select: { name: true } },
        },
      }),
    ]),
    prisma.task.findMany({
      where: {
        status: { notIn: ['CLOSED'] },
        dueAt: { lt: now },
        priority: { in: ['CRITICAL', 'HIGH'] },
        deletedAt: null,
      },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
      take: 10,
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
  ])

  // --- Users: full roster with stats ---
  const allUsers = await prisma.user.findMany({
    where: { blocked: false },
    include: {
      projectMemberships: { select: { projectId: true, role: true } },
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, dueAt: true, priority: true, estimateHours: true },
      },
      _count: {
        select: { assignedTasks: { where: { status: 'CLOSED', closedAt: { gte: since30d }, deletedAt: null } } },
      },
    },
  })

  const activeProjects = health.projects.filter((p) => p.status === 'ACTIVE')
  const activeProjectIds = activeProjects.map((p) => p.id)

  // --- Fix bug: members tim — query terpisah, group manual ---
  const projectMembers = activeProjectIds.length
    ? await prisma.projectMember.findMany({
        where: { projectId: { in: activeProjectIds } },
        include: { user: { select: { name: true } } },
        orderBy: { joinedAt: 'asc' },
      })
    : []
  const membersByProject = new Map<string, Array<{ name: string; role: string }>>()
  for (const m of projectMembers) {
    const list = membersByProject.get(m.projectId) ?? []
    list.push({ name: m.user.name, role: m.role })
    membersByProject.set(m.projectId, list)
  }

  // --- GitHub 7d aggregate ---
  const [githubCommits7d, githubByProject, topContributors7d, openPrCount] = await Promise.all([
    prisma.projectGithubEvent.count({
      where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } },
    }),
    prisma.projectGithubEvent.groupBy({
      by: ['projectId'],
      where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } },
      _count: { _all: true },
      orderBy: { _count: { projectId: 'desc' } },
      take: 5,
    }),
    prisma.projectGithubEvent.groupBy({
      by: ['actorLogin'],
      where: { kind: 'PUSH_COMMIT', createdAt: { gte: since7d } },
      _count: { _all: true },
      orderBy: { _count: { actorLogin: 'desc' } },
      take: 5,
    }),
    countOpenPrs(),
  ])

  const ghProjectIds = githubByProject.map((g) => g.projectId)
  const ghProjectNames = ghProjectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: ghProjectIds } },
        select: { id: true, name: true },
      })
    : []
  const ghNameMap = new Map(ghProjectNames.map((p) => [p.id, p.name]))

  // --- Effort 7d aggregate ---
  const [phantom7d, ghosts, effortRows] = await Promise.all([
    computePhantomWork({ days: 7, limit: 5 }),
    detectGhostTasks({ staleDays: 5, limit: 100 }),
    effortReport({ onlyClosed: false, limit: 200 }),
  ])
  const overbudgetCount = effortRows.filter((r) => r.verdict === 'over').length
  const underbudgetCount = effortRows.filter((r) => r.verdict === 'under').length

  // --- Agent status ---
  const [pendingAgents, offlineAgents, totalAgents] = await Promise.all([
    prisma.agent.count({ where: { status: 'PENDING' } }),
    prisma.agent.count({
      where: { status: 'APPROVED', OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: since24h } }] },
    }),
    prisma.agent.count({ where: { status: 'APPROVED' } }),
  ])

  // Format sections
  const userLines = allUsers
    .map((u) => {
      const loadRow = load.rows.find((r) => r.userId === u.id)
      const openTasks = u.assignedTasks
      const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now)
      const estimateTotal = openTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0)
      const closed30d = u._count.assignedTasks
      const projectCount = u.projectMemberships.length
      const overloaded = loadRow?.overloaded ? ' 🔴 OVERLOADED' : ''
      return `- ${u.name} (${u.role}, ${u.email}): ${openTasks.length} open, ${overdueTasks.length} overdue, ${closed30d} selesai 30h, ${estimateTotal.toFixed(0)}h estimasi, ${projectCount} proyek${overloaded}`
    })
    .join('\n')

  const projectLines = activeProjects
    .map((p) => {
      const memList = membersByProject.get(p.id) ?? []
      const memberNames = memList.slice(0, 5).map((m) => `${m.name}(${m.role})`).join(', ')
      return `- ${p.name} (Grade ${p.grade}, ${p.score}/100): ${p.openTasks} open, ${p.overdueTasks} overdue${p.pastDue ? ' ⚠️ LEWAT' : ''}${memberNames ? ` | Tim: ${memberNames}` : ''}`
    })
    .join('\n')

  const overdueLines = topOverdue
    .map((t) => {
      const days = Math.floor((now.getTime() - new Date(t.dueAt!).getTime()) / 86_400_000)
      return `- [${t.priority}] ${t.title} — ${t.assignee?.name ?? 'Unassigned'}, ${t.project?.name ?? '?'}, ${days} hari overdue`
    })
    .join('\n')

  const [statusChanges, comments] = recentActivity
  const activityLines = [
    ...statusChanges.map(
      (s) => `- ${s.author?.name ?? '?'}: "${s.task?.title}" ${s.fromStatus}→${s.toStatus} | ${s.task?.project?.name ?? '?'}`,
    ),
    ...comments.map((c) => `- ${c.author?.name ?? '?'} komentar di "${c.task?.title}": ${c.body.slice(0, 100)}`),
  ]
    .slice(0, 25)
    .join('\n')

  const riskLines =
    [
      risk.summary.pastDueProjects > 0 ? `- ${risk.summary.pastDueProjects} proyek melewati deadline` : '',
      risk.summary.overdueTasks > 0 ? `- ${risk.summary.overdueTasks} task overdue` : '',
      risk.summary.staleTasks > 0 ? `- ${risk.summary.staleTasks} task stale >3 hari` : '',
    ]
      .filter(Boolean)
      .join('\n') || '- Tidak ada risiko kritis'

  const eventLines = events.length
    ? events
        .map(
          (e) =>
            `- ${new Date(e.startsAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: ${e.title}`,
        )
        .join('\n')
    : '- Tidak ada event mendatang'

  const githubProjectLines = githubByProject.length
    ? githubByProject
        .map((g) => `- ${ghNameMap.get(g.projectId) ?? '?'}: ${g._count._all} commit`)
        .join('\n')
    : '- Tidak ada commit'
  const githubContribLines = topContributors7d.length
    ? topContributors7d.map((c) => `${c.actorLogin}(${c._count._all})`).join(', ')
    : 'tidak ada'

  const effortLines = [
    `- Phantom workers 7h: ${phantom7d.length ? phantom7d.slice(0, 5).map((p) => `${p.email}(${p.phantomHours}h)`).join(', ') : 'tidak ada'}`,
    `- Ghost tasks (stale >5h tidak ada update): ${ghosts.length}`,
    `- Task overbudget: ${overbudgetCount} | underbudget: ${underbudgetCount}`,
  ].join('\n')

  const agentLines = [
    `- Total agen disetujui: ${totalAgents}`,
    pendingAgents > 0 ? `- Pending approval: ${pendingAgents}` : '- Tidak ada agen pending',
    offlineAgents > 0 ? `- Offline >24h: ${offlineAgents}` : '- Semua agen online <24h',
  ].join('\n')

  return `Kamu adalah asisten AI untuk project management dashboard. Kamu memiliki pengetahuan lengkap tentang tim dan proyek. Jawab dengan ringkas, akurat, dan helpful. Data di bawah adalah kondisi real-time.

ATURAN JAWABAN:
- Jangan halusinasi entitas (user/task/project) yang tidak ada di "ROSTER TIM", "PROYEK AKTIF", "DOKUMEN RELEVAN", atau hasil tool calls.
- Bila merujuk fakta dari "DOKUMEN RELEVAN", sertakan tag sumber dalam format [#1], [#2], dst persis seperti label di dokumen tersebut.
- Bila pertanyaan menyangkut data yang tidak tersedia di konteks dan tidak ada di dokumen, jawab terus terang "data ini belum tercatat" alih-alih menebak.

PEMAKAIAN TOOLS (WAJIB):
- Tersedia 5 tool query read-only: query_users, query_tasks, query_project_detail, query_github_activity, query_effort. Hasilnya = data DB akurat real-time.
- WAJIB pakai tool untuk pertanyaan numerik/agregat (berapa, total, jumlah, top, rata-rata). Jangan tebak dari snapshot di atas — snapshot bisa tertinggal beberapa menit.
- WAJIB pakai tool kalau pertanyaan menyebut entitas spesifik yang belum kelihatan di konteks (mis. "task X", "proyek Y", "siapa Z").
- Boleh chain beberapa tool dalam satu jawaban (mis. resolve user lewat query_users dulu, lalu query_tasks pakai assigneeEmail).
- Tool error / hasil kosong → jawab "data tidak ditemukan", jangan halusinasi.

WAKTU SEKARANG: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB

═══ KPI SISTEM ═══
- Total task: ${overview.tasks.total} | Overdue: ${overview.tasks.overdueOpen} | Selesai 7h: ${overview.tasks.closed7d}
- Velocity: ${overview.velocity.closed7d} task/minggu | Stale: ${overview.tasks.staleInProgress}
- Risiko keseluruhan: ${risk.severity.toUpperCase()}

═══ ROSTER TIM (${allUsers.length} anggota) ═══
${userLines || '- Belum ada user'}

═══ PROYEK AKTIF (${activeProjects.length}) ═══
${projectLines || '- Belum ada proyek aktif'}

═══ TASK OVERDUE KRITIS (TOP ${topOverdue.length}) ═══
${overdueLines || '- Tidak ada task overdue kritis'}

═══ AKTIVITAS 7 HARI TERAKHIR ═══
${activityLines || '- Tidak ada aktivitas terbaru'}

═══ AKTIVITAS GITHUB 7H ═══
- Total commit 7h: ${githubCommits7d} | Open PR sistem: ${openPrCount}
- Top proyek:
${githubProjectLines}
- Top kontributor: ${githubContribLines}

═══ EFFORT 7H ═══
${effortLines}

═══ AGENT STATUS ═══
${agentLines}

═══ RISIKO ═══
${riskLines}

═══ EVENTS MENDATANG ═══
${eventLines}`
}

// Helper: count open PRs (open - closed/merged) across the whole system.
async function countOpenPrs(): Promise<number> {
  const [opened, closed] = await Promise.all([
    prisma.projectGithubEvent.findMany({
      where: { kind: 'PR_OPENED' },
      select: { projectId: true, prNumber: true },
    }),
    prisma.projectGithubEvent.findMany({
      where: { kind: { in: ['PR_CLOSED', 'PR_MERGED'] } },
      select: { projectId: true, prNumber: true },
    }),
  ])
  const closedKey = new Set(closed.filter((c) => c.prNumber != null).map((c) => `${c.projectId}:${c.prNumber}`))
  return opened.filter((o) => o.prNumber != null && !closedKey.has(`${o.projectId}:${o.prNumber}`)).length
}

// ─── RAG: inject relevant documents ──────────────────────────────────────────

export async function retrieveRelevantDocs(
  userMessage: string,
): Promise<{ text: string; count: number; sources: ChatSource[] }> {
  const result = await searchDocuments(userMessage, 6)
  if (!result.formatted) return { text: '', count: 0, sources: [] }
  const sources: ChatSource[] = result.hits.map((h: DocHit) => ({
    ref: h.ref,
    type: h.type,
    entityId: h.entityId,
    title: h.title,
  }))
  return {
    text: `═══ DOKUMEN RELEVAN DARI KNOWLEDGE BASE ═══\n${result.formatted}`,
    count: result.hits.length,
    sources,
  }
}

// ─── SSE streaming helper ─────────────────────────────────────────────────────

type SSEController = ReadableStreamDefaultController<Uint8Array>

const MAX_TOOL_ITERATIONS = 5

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type AnthropicAssistantMessage = {
  role: 'assistant'
  content: AnthropicContentBlock[]
}

type AnthropicUserMessage = {
  role: 'user'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
      >
}

type AnthropicMessage = AnthropicAssistantMessage | AnthropicUserMessage

export async function streamChatSSE(params: ChatStreamParams, ctrl: SSEController): Promise<void> {
  const { apiKey, model, baseUrl, timeoutMs = 120_000, systemContext, messages, relevantDocs, sources } = params

  const enc = new TextEncoder()
  const send = (event: string, data: object) => {
    try {
      ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch { /* disconnected */ }
  }

  if (sources && sources.length > 0) send('sources', { sources })

  const endpoint = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/v1/messages`
    : 'https://api.anthropic.com/v1/messages'

  // Build initial conversation history. Last user message gets RAG augmentation.
  const conversation: AnthropicMessage[] = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1
    if (isLast && m.role === 'user' && relevantDocs) {
      return { role: 'user', content: `${relevantDocs}\n\n---\n\nPertanyaan: ${m.content}` }
    }
    return m.role === 'user'
      ? { role: 'user', content: m.content }
      : { role: 'assistant', content: [{ type: 'text', text: m.content }] }
  })

  let full = ''
  const toolCallsTrace: Array<{ name: string; input: unknown; result: unknown }> = []

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
    const isFinalIter = iter === MAX_TOOL_ITERATIONS - 1
    // Non-streaming for tool-use turns; stream only the final text turn.
    // We try streaming each call: if it returns tool_use, we re-fetch non-stream to get full structured content.
    // Simpler: always non-stream the call, then emit tokens manually from the text block(s).
    send('phase', { phase: 'thinking', iter })

    const body = {
      model: model ?? 'claude-opus-4-7',
      max_tokens: 2048,
      system: systemContext,
      messages: conversation,
      tools: isFinalIter ? undefined : CHAT_TOOLS,
    }

    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      send('error', { message: `Network error: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      send('error', { message: `Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}` })
      return
    }

    const payload = (await res.json()) as {
      stop_reason: string
      content: AnthropicContentBlock[]
    }

    // Persist assistant turn into conversation as-is.
    conversation.push({ role: 'assistant', content: payload.content })

    // Stream text blocks token-ish (sent as one chunk each — granular streaming requires SSE-mode).
    for (const block of payload.content) {
      if (block.type === 'text' && block.text) {
        full += block.text
        send('token', { text: block.text })
      }
    }

    if (payload.stop_reason !== 'tool_use') break

    // Execute every tool_use block, collect tool_result blocks for next user turn.
    const toolResults: Array<{
      type: 'tool_result'
      tool_use_id: string
      content: string
      is_error?: boolean
    }> = []
    for (const block of payload.content) {
      if (block.type !== 'tool_use') continue
      send('tool_use', { id: block.id, name: block.name, input: block.input })
      const result = await executeChatTool(block.name, block.input)
      toolCallsTrace.push({ name: block.name, input: block.input, result })
      const resultStr = JSON.stringify(result)
      send('tool_result', { id: block.id, name: block.name, ok: result.ok, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultStr,
        is_error: !result.ok,
      })
    }

    conversation.push({ role: 'user', content: toolResults })
  }

  send('done', { full, sources: sources ?? [], toolCalls: toolCallsTrace })
}
