import { computeAdminOverview, computeProjectHealth, computeRiskReport, computeTeamLoad } from './admin-overview'
import { prisma } from './db'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatStreamParams {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  systemContext: string
  messages: ChatMessage[]
}

// ─── Context builder ──────────────────────────────────────────────────────────

export async function buildChatContext(): Promise<string> {
  const now = new Date()

  const [overview, health, load, risk, events] = await Promise.all([
    computeAdminOverview({ recentAuditLimit: 0 }),
    computeProjectHealth({ includeArchived: false, limit: 20 }),
    computeTeamLoad({ includeUnassigned: false, limit: 15 }),
    computeRiskReport(),
    prisma.event.findMany({
      where: { startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      include: { tags: { include: { tag: { select: { name: true } } } } },
    }),
  ])

  const activeProjects = health.projects.filter((p) => p.status === 'ACTIVE')
  const projectLines = activeProjects
    .map(
      (p) =>
        `- ${p.name} (Grade ${p.grade}, skor ${p.score}/100): ${p.openTasks} open, ${p.overdueTasks} overdue${p.pastDue ? ' ⚠️' : ''}${p.blockedTasks > 0 ? `, ${p.blockedTasks} blocked` : ''}`,
    )
    .join('\n')

  const teamLines = load.rows
    .map(
      (u) =>
        `- ${u.name}: ${u.open} open, ${u.overdue} overdue, ${u.closed7d} selesai 7h${u.overloaded ? ' 🔴 OVERLOADED' : ''}`,
    )
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

  return `Kamu adalah asisten AI untuk project management dashboard. Kamu memiliki akses ke data real-time proyek dan tim berikut. Jawab pertanyaan user secara ringkas, jelas, dan helpful. Gunakan data di bawah sebagai konteks.

WAKTU SEKARANG: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB

═══ KPI SISTEM ═══
- Total task: ${overview.tasks.total} | Overdue: ${overview.tasks.overdueOpen} | Selesai 7h: ${overview.tasks.closed7d}
- Velocity: ${overview.velocity.closed7d} task/minggu | Stale: ${overview.tasks.staleInProgress}
- Risiko keseluruhan: ${risk.severity.toUpperCase()}

═══ PROYEK AKTIF (${activeProjects.length}) ═══
${projectLines || '- Belum ada proyek aktif'}

═══ BEBAN TIM (${load.rows.length} anggota) ═══
${teamLines || '- Belum ada data tim'}

═══ RISIKO ═══
${riskLines}

═══ EVENTS MENDATANG ═══
${eventLines}`
}

// ─── SSE streaming helper ─────────────────────────────────────────────────────

type SSEController = ReadableStreamDefaultController<Uint8Array>

export async function streamChatSSE(params: ChatStreamParams, ctrl: SSEController): Promise<void> {
  const { apiKey, model, baseUrl, timeoutMs = 120_000, systemContext, messages } = params

  const enc = new TextEncoder()
  const send = (event: string, data: object) => {
    try {
      ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch {
      /* disconnected */
    }
  }

  const endpoint = baseUrl ? `${baseUrl.replace(/\/$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model ?? 'claude-opus-4-7',
      max_tokens: 2048,
      stream: true,
      system: systemContext,
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    send('error', { message: `Claude API error ${res.status}: ${err.error?.message ?? 'unknown'}` })
    return
  }

  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })

    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''

    for (const part of parts) {
      let data = ''
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (!data || data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as { type: string; delta?: { type: string; text: string } }
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          full += parsed.delta.text
          send('token', { text: parsed.delta.text })
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  send('done', { full })
}
