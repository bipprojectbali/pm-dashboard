// RAG knowledge base: sync project entities → ChatDocument, search at query time.
// Default: PostgreSQL FTS + pg_trgm (zero cost, no API key).
// Enhanced: pgvector semantic search when embedding settings are configured.
//   - Compatible with any OpenAI-compatible API (OpenRouter, OpenAI, dll)
//   - Settings: embedding.apiKey, embedding.baseUrl, embedding.model
//
// Coverage: user, task, project, event, comment, github_project, milestone,
// extension, dependency, evidence, audit_recent, report_history, project_retro.

import { getSetting } from './app-settings'
import { prisma } from './db'
import { isExtensionEnabled } from './extensions'
import { computeProjectGithubSummary } from './github-summary'
import { computeRetro, renderRetroMarkdown } from './retro'

const STOPWORDS_ID = new Set([
  'dan',
  'yang',
  'di',
  'ke',
  'dari',
  'untuk',
  'adalah',
  'ada',
  'dengan',
  'ini',
  'itu',
  'atau',
  'juga',
  'sudah',
  'belum',
  'tidak',
  'bisa',
  'mana',
  'siapa',
  'apa',
  'berapa',
  'bagaimana',
  'kapan',
  'apakah',
  'tolong',
  'mohon',
  'beri',
  'tampilkan',
  'tunjukkan',
  'lihat',
  'cari',
  'semua',
  'saya',
  'kamu',
  'dia',
  'kami',
  'kita',
  'mereka',
  'tentang',
  'pada',
  'akan',
  'dapat',
  'perlu',
  'harus',
  'sedang',
  'telah',
  'lagi',
  'paling',
])

// Cosine similarity threshold: dokumen di bawah ini dianggap tidak relevan.
const SEMANTIC_MIN_SIMILARITY = 0.35
// Kalau semantic search return < 3 doc relevan, merge dengan FTS fallback.
const MIN_SEMANTIC_HITS = 3

// ─── Keyword extraction ───────────────────────────────────────────────────────

export function extractKeywords(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS_ID.has(w))

  const capitalWords = text.split(/\s+/).filter((w) => w.length >= 2 && /^[A-Z]/.test(w))

  const unique = [...new Set([...words, ...capitalWords.map((w) => w.toLowerCase())])]
  return unique.join(' | ')
}

// ─── Embedding (optional, agnostic API) ──────────────────────────────────────

let _embeddingSettingsCache: { apiKey: string; baseUrl: string; model: string } | null | undefined

export function invalidateEmbeddingCache(): void {
  _embeddingSettingsCache = undefined
}

export async function getEmbeddingSettings(): Promise<{ apiKey: string; baseUrl: string; model: string } | null> {
  if (_embeddingSettingsCache !== undefined) return _embeddingSettingsCache
  const [apiKey, baseUrl, model] = await Promise.all([
    getSetting('embedding.apiKey'),
    getSetting('embedding.baseUrl'),
    getSetting('embedding.model'),
  ])
  const resolved = !apiKey
    ? null
    : {
        apiKey: apiKey as string,
        baseUrl: (baseUrl as string) || 'https://openrouter.ai/api/v1',
        model: (model as string) || 'openai/text-embedding-3-small',
      }
  _embeddingSettingsCache = resolved
  return resolved
}

async function generateEmbedding(
  text: string,
  settings: { apiKey: string; baseUrl: string; model: string },
): Promise<number[] | null> {
  try {
    const endpoint = `${settings.baseUrl.replace(/\/$/, '')}/embeddings`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: settings.model, input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

// ─── Document search ──────────────────────────────────────────────────────────

interface DocResult {
  id: string
  type: string
  entityId: string
  title: string
  content: string
  tags: string
  rank: number
}

export interface DocHit {
  ref: string
  type: string
  entityId: string
  title: string
  content: string
}

export interface SearchResult {
  hits: DocHit[]
  formatted: string
}

function renderHits(rows: DocResult[]): SearchResult {
  const hits: DocHit[] = rows.map((r, i) => ({
    ref: `#${i + 1}`,
    type: r.type,
    entityId: r.entityId,
    title: r.title,
    content: r.content,
  }))
  const formatted = hits.map((h) => `[${h.ref}] ${h.type}: ${h.title}\n${h.content}`).join('\n\n---\n\n')
  return { hits, formatted }
}

export async function searchDocuments(userMessage: string, limit = 6, typeFilter?: string): Promise<SearchResult> {
  const collected = new Map<string, DocResult>()

  // ── 1) Semantic via pgvector ────────────────────────────────────────────
  const embeddingSettings = await getEmbeddingSettings()
  if (embeddingSettings) {
    const queryVector = await generateEmbedding(userMessage, embeddingSettings)
    if (queryVector) {
      try {
        const vectorStr = `[${queryVector.join(',')}]`
        const semantic = typeFilter
          ? await prisma.$queryRaw<DocResult[]>`
              SELECT id, type, "entityId", title, content, tags,
                (1 - (embedding <=> ${vectorStr}::vector)) AS rank
              FROM "chat_document"
              WHERE embedding IS NOT NULL
                AND type = ${typeFilter}
                AND (1 - (embedding <=> ${vectorStr}::vector)) > ${SEMANTIC_MIN_SIMILARITY}
              ORDER BY embedding <=> ${vectorStr}::vector
              LIMIT ${limit}
            `
          : await prisma.$queryRaw<DocResult[]>`
              SELECT id, type, "entityId", title, content, tags,
                (1 - (embedding <=> ${vectorStr}::vector)) AS rank
              FROM "chat_document"
              WHERE embedding IS NOT NULL
                AND (1 - (embedding <=> ${vectorStr}::vector)) > ${SEMANTIC_MIN_SIMILARITY}
              ORDER BY embedding <=> ${vectorStr}::vector
              LIMIT ${limit}
            `
        for (const r of semantic) collected.set(r.id, r)
        if (collected.size >= MIN_SEMANTIC_HITS) {
          return renderHits([...collected.values()].slice(0, limit))
        }
      } catch {
        /* fallback to FTS */
      }
    }
  }

  // ── 2) FTS fallback (and merge if semantic returned too few) ────────────
  const keywords = extractKeywords(userMessage)
  if (keywords) {
    let results: DocResult[] = []
    try {
      results = typeFilter
        ? await prisma.$queryRaw<DocResult[]>`
            SELECT id, type, "entityId", title, content, tags,
              ts_rank(to_tsvector('simple', title || ' ' || content),
                      to_tsquery('simple', ${keywords})) AS rank
            FROM "chat_document"
            WHERE type = ${typeFilter}
              AND to_tsvector('simple', title || ' ' || content) @@ to_tsquery('simple', ${keywords})
            ORDER BY rank DESC
            LIMIT ${limit}
          `
        : await prisma.$queryRaw<DocResult[]>`
            SELECT id, type, "entityId", title, content, tags,
              ts_rank(to_tsvector('simple', title || ' ' || content),
                      to_tsquery('simple', ${keywords})) AS rank
            FROM "chat_document"
            WHERE to_tsvector('simple', title || ' ' || content) @@ to_tsquery('simple', ${keywords})
            ORDER BY rank DESC
            LIMIT ${limit}
          `
    } catch {
      try {
        const plain = keywords.replace(/\s*\|\s*/g, ' ')
        results = typeFilter
          ? await prisma.$queryRaw<DocResult[]>`
              SELECT id, type, "entityId", title, content, tags,
                ts_rank(to_tsvector('simple', title || ' ' || content),
                        plainto_tsquery('simple', ${plain})) AS rank
              FROM "chat_document"
              WHERE type = ${typeFilter}
                AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${plain})
              ORDER BY rank DESC
              LIMIT ${limit}
            `
          : await prisma.$queryRaw<DocResult[]>`
              SELECT id, type, "entityId", title, content, tags,
                ts_rank(to_tsvector('simple', title || ' ' || content),
                        plainto_tsquery('simple', ${plain})) AS rank
              FROM "chat_document"
              WHERE to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${plain})
              ORDER BY rank DESC
              LIMIT ${limit}
            `
      } catch {
        /* nothing */
      }
    }
    for (const r of results) if (!collected.has(r.id)) collected.set(r.id, r)
  }

  // ── 3) Trigram fuzzy match for proper names ─────────────────────────────
  if (collected.size < 3) {
    const nameWords = userMessage.split(/\s+/).filter((w) => w.length >= 3 && /^[A-Z]/.test(w))
    for (const name of nameWords) {
      try {
        const trgm = await prisma.$queryRaw<DocResult[]>`
          SELECT id, type, "entityId", title, content, tags,
            similarity(title, ${name}) AS rank
          FROM "chat_document"
          WHERE similarity(title, ${name}) > 0.2
          ORDER BY rank DESC LIMIT 3
        `
        for (const r of trgm) if (!collected.has(r.id)) collected.set(r.id, r)
      } catch {
        /* pg_trgm not installed */
      }
    }
  }

  return renderHits([...collected.values()].slice(0, limit))
}

// ─── Sync status ──────────────────────────────────────────────────────────────

export async function getChatSyncStatus() {
  const [total, byType, latest] = await Promise.all([
    prisma.chatDocument.count(),
    prisma.chatDocument.groupBy({ by: ['type'], _count: true }),
    prisma.chatDocument.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } }),
  ])
  const breakdown = Object.fromEntries(byType.map((r) => [r.type, r._count]))
  return { totalDocuments: total, lastSync: latest?.syncedAt ?? null, breakdown }
}

// ─── Document builders ────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null): string {
  if (!d) return 'tidak ada'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysAgo(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

// ─── Upsert with optional embedding ──────────────────────────────────────────

interface UpsertOpts {
  type: string
  entityId: string
  title: string
  content: string
  tags?: string
  projectId?: string | null
}

interface SyncCounters {
  synced: number
  failedEmbeddings: number
}

async function upsertDoc(
  opts: UpsertOpts,
  embSettings: Awaited<ReturnType<typeof getEmbeddingSettings>> | undefined,
  counters: SyncCounters,
) {
  const { type, entityId, title, content, tags = '', projectId = null } = opts

  let embeddingRaw: string | undefined
  if (embSettings) {
    const vec = await generateEmbedding(`${title}\n${content}`, embSettings)
    if (vec) embeddingRaw = `[${vec.join(',')}]`
    else counters.failedEmbeddings += 1
  }

  if (embeddingRaw) {
    await prisma.$executeRaw`
      INSERT INTO "chat_document" (id, type, "entityId", "projectId", title, content, tags, embedding, "syncedAt")
      VALUES (${crypto.randomUUID()}, ${type}, ${entityId}, ${projectId}, ${title}, ${content}, ${tags}, ${embeddingRaw}::vector, NOW())
      ON CONFLICT (type, "entityId") DO UPDATE
        SET title=${title}, content=${content}, tags=${tags},
            "projectId"=${projectId},
            embedding=${embeddingRaw}::vector, "syncedAt"=NOW()
    `
  } else {
    await prisma.chatDocument.upsert({
      where: { type_entityId: { type, entityId } },
      create: {
        id: crypto.randomUUID(),
        type,
        entityId,
        projectId: projectId ?? null,
        title,
        content,
        tags,
        syncedAt: new Date(),
      },
      update: { title, content, tags, projectId: projectId ?? null, syncedAt: new Date() },
    })
  }
  counters.synced += 1
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export interface SyncResult {
  synced: number
  pruned: number
  failedEmbeddings: number
}

export async function syncChatDocuments(opts: { full?: boolean } = {}): Promise<SyncResult> {
  const embSettings = await getEmbeddingSettings()

  const since = opts.full
    ? null
    : await prisma.chatDocument
        .findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } })
        .then((r) => r?.syncedAt ?? null)

  const counters: SyncCounters = { synced: 0, failedEmbeddings: 0 }
  const cutoff30d = new Date(Date.now() - 30 * 86_400_000)
  const cutoff7d = new Date(Date.now() - 7 * 86_400_000)
  const now = new Date()

  // ── Users ──────────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: {
      blocked: false,
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      projectMemberships: { include: { project: { select: { id: true, name: true } } } },
      assignedTasks: {
        where: { status: { notIn: ['CLOSED'] }, deletedAt: null },
        select: { id: true, title: true, status: true, priority: true, dueAt: true },
      },
    },
  })

  for (const u of users) {
    const openTasks = u.assignedTasks
    const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now)
    const projects = u.projectMemberships.map((m) => `${m.project.name} (${m.role})`).join(', ')
    const overdueList = overdueTasks
      .slice(0, 5)
      .map((t) => `    - ${t.title} [${t.priority}]`)
      .join('\n')

    const content = [
      `[USER] ${u.name} — ${u.role} | ${u.email}`,
      `Status: ${u.blocked ? 'DIBLOKIR' : 'Aktif'}`,
      `Task aktif: ${openTasks.length} open, ${overdueTasks.length} overdue`,
      projects ? `Proyek: ${projects}` : null,
      overdueTasks.length > 0 ? `Task overdue:\n${overdueList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'user', entityId: u.id, title: `${u.name} (${u.email})`, content, tags: u.role.toLowerCase() },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: { notIn: ['CLOSED'] } }, { closedAt: { gte: cutoff30d } }],
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      assignee: { select: { name: true, email: true } },
      reporter: { select: { name: true } },
      project: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { author: { select: { name: true } } },
      },
      statusChanges: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { author: { select: { name: true } } },
      },
    },
  })

  for (const t of tasks) {
    const isOverdue = t.dueAt && new Date(t.dueAt) < now && t.status !== 'CLOSED'
    const overdueDays = t.dueAt && isOverdue ? daysAgo(t.dueAt) : 0
    const commentLines = t.comments.map((c) => `  - ${c.author?.name ?? 'Unknown'}: ${c.body.slice(0, 200)}`).join('\n')
    const historyLines = t.statusChanges
      .map((s) => `  - ${s.author?.name ?? '?'}: ${s.fromStatus}→${s.toStatus} (${fmtDate(s.createdAt)})`)
      .join('\n')
    const tagList = t.tags.map((tg) => tg.tag.name).join(', ')

    const content = [
      `[TASK] ${t.title}`,
      `Proyek: ${t.project?.name ?? '?'} | Assignee: ${t.assignee?.name ?? 'Unassigned'}${t.assignee?.email ? ` (${t.assignee.email})` : ''} | Reporter: ${t.reporter?.name ?? '?'}`,
      `Status: ${t.status} | Priority: ${t.priority} | Kind: ${t.kind}`,
      t.dueAt ? `Due: ${fmtDate(t.dueAt)}${isOverdue ? ` (OVERDUE ${overdueDays} hari)` : ''}` : 'Due: tidak ada',
      t.estimateHours ? `Estimasi: ${t.estimateHours}h` : null,
      t.description ? `Deskripsi: ${t.description.slice(0, 400)}` : null,
      t.comments.length > 0 ? `Komentar terbaru:\n${commentLines}` : null,
      t.statusChanges.length > 0 ? `History status:\n${historyLines}` : null,
      tagList ? `Tags: ${tagList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const docTags = [t.status.toLowerCase(), t.priority.toLowerCase(), t.kind.toLowerCase(), tagList]
      .filter(Boolean)
      .join(',')
    await upsertDoc(
      { type: 'task', entityId: t.id, title: t.title, content, tags: docTags, projectId: t.projectId },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const projects = await prisma.project.findMany({
    where: {
      archivedAt: null,
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      owner: { select: { name: true, email: true } },
      members: { include: { user: { select: { name: true, email: true } } } },
      milestones: { where: { dueAt: { gte: now } }, take: 3, orderBy: { dueAt: 'asc' } },
      _count: { select: { tasks: true } },
    },
  })

  for (const p of projects) {
    const memberLines = p.members
      .slice(0, 10)
      .map((m) => `${m.user.name} (${m.role})`)
      .join(', ')
    const milestoneLines = p.milestones.map((m) => `  - ${m.title}: ${fmtDate(m.dueAt ?? null)}`).join('\n')
    const isPastDue = p.endsAt && new Date(p.endsAt) < now

    const content = [
      `[PROJECT] ${p.name} — ${p.status}`,
      `Owner: ${p.owner.name} (${p.owner.email})`,
      `Priority: ${p.priority}`,
      p.endsAt ? `Deadline: ${fmtDate(p.endsAt)}${isPastDue ? ' ⚠️ LEWAT DEADLINE' : ''}` : 'Deadline: tidak ada',
      memberLines ? `Anggota tim: ${memberLines}` : null,
      p.description ? `Deskripsi: ${p.description.slice(0, 300)}` : null,
      p.milestones.length > 0 ? `Milestone mendatang:\n${milestoneLines}` : null,
      p.githubRepo ? `GitHub: ${p.githubRepo}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'project', entityId: p.id, title: p.name, content, tags: p.status.toLowerCase(), projectId: p.id },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  const events = await prisma.event.findMany({
    where: {
      startsAt: { gte: now },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    include: {
      createdBy: { select: { name: true } },
      project: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  })

  for (const e of events) {
    const tagList = e.tags.map((t) => t.tag.name).join(', ')
    const content = [
      `[EVENT] ${e.title}`,
      `Waktu: ${fmtDate(e.startsAt)}${e.endsAt ? ` s.d. ${fmtDate(e.endsAt)}` : ''}`,
      e.location ? `Lokasi: ${e.location}` : null,
      e.project ? `Proyek: ${e.project.name}` : null,
      e.createdBy ? `Dibuat oleh: ${e.createdBy.name}` : null,
      e.description ? `Catatan: ${e.description.slice(0, 300)}` : null,
      tagList ? `Tags: ${tagList}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'event', entityId: e.id, title: e.title, content, tags: tagList, projectId: e.projectId ?? null },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Recent comments (last 7d) ─────────────────────────────────────────────
  const comments = await prisma.taskComment.findMany({
    where: { createdAt: { gte: since ?? cutoff7d } },
    include: {
      author: { select: { name: true } },
      task: { select: { title: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  for (const c of comments) {
    const content = [
      `[COMMENT] di task: ${c.task?.title ?? '?'}`,
      `Proyek: ${c.task?.project?.name ?? '?'}`,
      `Oleh: ${c.author?.name ?? '?'} | Tanggal: ${fmtDate(c.createdAt)}`,
      `Isi: ${c.body}`,
    ].join('\n')

    await upsertDoc(
      {
        type: 'comment',
        entityId: c.id,
        title: `Komentar: ${c.task?.title ?? '?'}`,
        content,
        projectId: c.task?.projectId ?? null,
      },
      undefined,
      counters,
    )
  }

  // ── GitHub per project (aggregate; refreshed on every incremental sync) ────
  // Scope: hanya proyek yang punya githubRepo terisi, tidak archived.
  // Skip kalau extension github OFF — data ProjectGithubEvent ada tapi sumbernya beku.
  const githubExtensionOn = await isExtensionEnabled('github')
  const projectsWithRepo = githubExtensionOn
    ? await prisma.project.findMany({
        where: { archivedAt: null, githubRepo: { not: null } },
        select: { id: true, name: true },
      })
    : []

  for (const p of projectsWithRepo) {
    const summary = await computeProjectGithubSummary(p.id)
    if (!summary?.linked) continue
    const top = summary.contributors
      .slice(0, 5)
      .map((c) => `${c.login} (${c.commits})`)
      .join(', ')
    const openLines = summary.openPrs
      .slice(0, 5)
      .map((pr) => `  - #${pr.prNumber} ${pr.title} (${pr.actorLogin})`)
      .join('\n')
    const recent = summary.recent
      .slice(0, 8)
      .map((e) => `  - ${e.kind} oleh ${e.matchedUser?.name ?? e.actorLogin}: ${e.title.slice(0, 80)}`)
      .join('\n')

    const content = [
      `[GITHUB] ${p.name} — repo: ${summary.repo}`,
      `Stats 30h: ${summary.stats.commits30d} commit, ${summary.stats.contributors30d} kontributor`,
      `Stats 7h: ${summary.stats.commits7d} commit`,
      `Open PR: ${summary.stats.openPrs}`,
      summary.stats.lastPushAt
        ? `Push terakhir: ${fmtDate(summary.stats.lastPushAt)} oleh ${summary.stats.lastPushBy}`
        : null,
      top ? `Top kontributor: ${top}` : null,
      openLines ? `PR open:\n${openLines}` : null,
      recent ? `Aktivitas terkini:\n${recent}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await upsertDoc(
      { type: 'github_project', entityId: p.id, title: `GitHub: ${p.name}`, content, tags: 'github', projectId: p.id },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Milestones (semua, mendatang & lewat) ─────────────────────────────────
  const milestones = await prisma.projectMilestone.findMany({
    where: since ? { updatedAt: { gte: since } } : {},
    include: { project: { select: { id: true, name: true } } },
    orderBy: { dueAt: 'asc' },
    take: 500,
  })
  for (const m of milestones) {
    const isOverdue = m.dueAt && new Date(m.dueAt) < now && !m.completedAt
    const content = [
      `[MILESTONE] ${m.title}`,
      `Proyek: ${m.project.name}`,
      m.dueAt ? `Due: ${fmtDate(m.dueAt)}${isOverdue ? ' (LEWAT)' : ''}` : 'Due: tidak ada',
      m.completedAt ? `Selesai: ${fmtDate(m.completedAt)}` : 'Belum selesai',
      m.description ? `Catatan: ${m.description.slice(0, 300)}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'milestone',
        entityId: m.id,
        title: `Milestone: ${m.title}`,
        content,
        tags: m.completedAt ? 'milestone,completed' : 'milestone,open',
        projectId: m.projectId,
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Extensions (perpanjangan deadline proyek) ─────────────────────────────
  const extensions = await prisma.projectExtension.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    include: {
      project: { select: { id: true, name: true } },
      extendedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  for (const ext of extensions) {
    const content = [
      `[EXTENSION] Perpanjangan deadline ${ext.project.name}`,
      `Dari ${fmtDate(ext.previousEndAt ?? null)} → ${fmtDate(ext.newEndAt)}`,
      ext.extendedBy ? `Diajukan oleh: ${ext.extendedBy.name} (${ext.extendedBy.email})` : null,
      `Tanggal: ${fmtDate(ext.createdAt)}`,
      ext.reason ? `Alasan: ${ext.reason}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'extension',
        entityId: ext.id,
        title: `Extension: ${ext.project.name}`,
        content,
        tags: 'extension',
        projectId: ext.projectId,
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Task dependencies (blocker chain, one doc per task that has blockers) ─
  // Strategy: agregat per task → satu doc list semua blocker.
  const depRows = await prisma.taskDependency.findMany({
    include: {
      task: { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } },
      blockedBy: { select: { id: true, title: true, status: true } },
    },
  })
  const depByTask = new Map<string, typeof depRows>()
  for (const d of depRows) {
    const list = depByTask.get(d.taskId) ?? []
    list.push(d)
    depByTask.set(d.taskId, list)
  }
  for (const [taskId, deps] of depByTask) {
    const first = deps[0]
    const blockerLines = deps.map((d) => `  - ${d.blockedBy.title} (${d.blockedBy.status})`).join('\n')
    const content = [
      `[DEPENDENCY] Task "${first.task.title}" terblok oleh ${deps.length} task`,
      `Proyek: ${first.task.project?.name ?? '?'}`,
      `Daftar blocker:\n${blockerLines}`,
    ].join('\n')
    await upsertDoc(
      {
        type: 'dependency',
        entityId: taskId,
        title: `Blocker: ${first.task.title}`,
        content,
        tags: 'dependency,blocked',
        projectId: first.task.projectId,
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Task evidence (URL bukti / attachment) ────────────────────────────────
  const evidence = await prisma.taskEvidence.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    include: {
      task: { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  for (const ev of evidence) {
    const content = [
      `[EVIDENCE] ${ev.kind} pada task "${ev.task?.title ?? '?'}"`,
      `Proyek: ${ev.task?.project?.name ?? '?'}`,
      `URL: ${ev.url}`,
      ev.note ? `Catatan: ${ev.note}` : null,
      `Ditambahkan: ${fmtDate(ev.createdAt)}`,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'evidence',
        entityId: ev.id,
        title: `Evidence: ${ev.task?.title ?? ev.url.slice(0, 60)}`,
        content,
        tags: `evidence,${ev.kind.toLowerCase()}`,
        projectId: ev.task?.projectId ?? null,
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Audit log (role/block changes — 30d) ──────────────────────────────────
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['ROLE_CHANGED', 'BLOCKED', 'UNBLOCKED'] },
      createdAt: { gte: since ?? cutoff30d },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  for (const a of auditLogs) {
    const content = [
      `[AUDIT] ${a.action}`,
      a.user ? `Target user: ${a.user.name} (${a.user.email})` : null,
      `Waktu: ${fmtDate(a.createdAt)}`,
      a.detail ? `Detail: ${a.detail}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'audit_recent',
        entityId: a.id,
        title: `Audit: ${a.action} — ${a.user?.name ?? 'unknown'}`,
        content,
        tags: a.action.toLowerCase(),
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Report history (laporan harian Telegram — 30d) ────────────────────────
  const reports = await prisma.reportHistory.findMany({
    where: { sentAt: { gte: since ?? cutoff30d } },
    orderBy: { sentAt: 'desc' },
    take: 100,
  })
  for (const r of reports) {
    const content = [
      `[REPORT] Laporan ${r.trigger} — ${fmtDate(r.sentAt)}`,
      `Status: ${r.ok ? 'sukses' : 'gagal'}`,
      `Pesan: ${r.message.slice(0, 200)}`,
      r.markdown ? `\nIsi:\n${r.markdown.slice(0, 2000)}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    await upsertDoc(
      {
        type: 'report_history',
        entityId: r.id,
        title: `Laporan ${fmtDate(r.sentAt)}`,
        content,
        tags: r.ok ? 'report,ok' : 'report,fail',
      },
      embSettings ?? undefined,
      counters,
    )
  }

  // ── Project retro (full-sync only — mahal: 7 queries per project) ─────────
  if (opts.full) {
    const since14d = new Date(Date.now() - 14 * 86_400_000)
    const activeProjects = await prisma.project.findMany({
      where: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      select: { id: true, name: true },
      take: 50,
    })
    // Sequential batch of 5 to avoid hammering DB.
    for (let i = 0; i < activeProjects.length; i += 5) {
      const batch = activeProjects.slice(i, i + 5)
      await Promise.all(
        batch.map(async (p) => {
          try {
            const retro = await computeRetro({ projectId: p.id, since: since14d })
            if (!retro) return
            const md = renderRetroMarkdown(retro).slice(0, 3000)
            await upsertDoc(
              {
                type: 'project_retro',
                entityId: p.id,
                title: `Retro 14h: ${p.name}`,
                content: md,
                tags: 'retro',
                projectId: p.id,
              },
              embSettings ?? undefined,
              counters,
            )
          } catch {
            /* skip failed retro */
          }
        }),
      )
    }
  }

  // ── Orphan prune (full-sync only) ─────────────────────────────────────────
  let pruned = 0
  if (opts.full) {
    pruned = await pruneOrphanDocs()
  }

  return { synced: counters.synced, pruned, failedEmbeddings: counters.failedEmbeddings }
}

// ─── Orphan prune ─────────────────────────────────────────────────────────────

async function pruneOrphanDocs(): Promise<number> {
  const now = new Date()
  const closed180d = new Date(now.getTime() - 180 * 86_400_000)
  const archived90d = new Date(now.getTime() - 90 * 86_400_000)
  const eventCutoff = new Date(now.getTime() - 7 * 86_400_000)
  const commentCutoff = new Date(now.getTime() - 30 * 86_400_000)
  const auditCutoff = new Date(now.getTime() - 30 * 86_400_000)
  const reportCutoff = new Date(now.getTime() - 30 * 86_400_000)

  let total = 0

  // user: prune kalau blocked atau hilang
  total += await pruneByType('user', async () => {
    const ids = (await prisma.user.findMany({ where: { blocked: false }, select: { id: true } })).map((u) => u.id)
    return ids
  })

  // task: prune deletedAt not null OR (CLOSED & closedAt < 180d)
  total += await pruneByType('task', async () => {
    const ids = (
      await prisma.task.findMany({
        where: {
          deletedAt: null,
          OR: [{ status: { notIn: ['CLOSED'] } }, { closedAt: { gte: closed180d } }],
        },
        select: { id: true },
      })
    ).map((t) => t.id)
    return ids
  })

  // project: prune archived > 90d atau status CANCELLED/COMPLETED
  total += await pruneByType('project', async () => {
    const ids = (
      await prisma.project.findMany({
        where: {
          AND: [
            { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
            { OR: [{ archivedAt: null }, { archivedAt: { gte: archived90d } }] },
          ],
        },
        select: { id: true },
      })
    ).map((p) => p.id)
    return ids
  })

  // event: prune yg startsAt < now - 7d
  total += await pruneByType('event', async () => {
    const ids = (
      await prisma.event.findMany({
        where: { startsAt: { gte: eventCutoff } },
        select: { id: true },
      })
    ).map((e) => e.id)
    return ids
  })

  // comment: prune > 30d
  total += await pruneByType('comment', async () => {
    const ids = (
      await prisma.taskComment.findMany({
        where: { createdAt: { gte: commentCutoff } },
        select: { id: true },
      })
    ).map((c) => c.id)
    return ids
  })

  // github_project: prune project hilang/archived
  total += await pruneByType('github_project', async () => {
    const ids = (
      await prisma.project.findMany({
        where: { archivedAt: null, githubRepo: { not: null } },
        select: { id: true },
      })
    ).map((p) => p.id)
    return ids
  })

  // milestone: prune kalau milestone tidak ada
  total += await pruneByType('milestone', async () => {
    const ids = (await prisma.projectMilestone.findMany({ select: { id: true } })).map((m) => m.id)
    return ids
  })

  // extension: prune kalau extension tidak ada
  total += await pruneByType('extension', async () => {
    const ids = (await prisma.projectExtension.findMany({ select: { id: true } })).map((e) => e.id)
    return ids
  })

  // dependency: prune kalau task tidak punya blocker lagi
  total += await pruneByType('dependency', async () => {
    const ids = (await prisma.taskDependency.findMany({ select: { taskId: true }, distinct: ['taskId'] })).map(
      (d) => d.taskId,
    )
    return ids
  })

  // evidence: prune kalau row tidak ada
  total += await pruneByType('evidence', async () => {
    const ids = (await prisma.taskEvidence.findMany({ select: { id: true } })).map((e) => e.id)
    return ids
  })

  // audit_recent: prune > 30d
  total += await pruneByType('audit_recent', async () => {
    const ids = (
      await prisma.auditLog.findMany({
        where: { action: { in: ['ROLE_CHANGED', 'BLOCKED', 'UNBLOCKED'] }, createdAt: { gte: auditCutoff } },
        select: { id: true },
      })
    ).map((a) => a.id)
    return ids
  })

  // report_history: prune > 30d
  total += await pruneByType('report_history', async () => {
    const ids = (
      await prisma.reportHistory.findMany({
        where: { sentAt: { gte: reportCutoff } },
        select: { id: true },
      })
    ).map((r) => r.id)
    return ids
  })

  // project_retro: prune kalau project archived/hilang
  total += await pruneByType('project_retro', async () => {
    const ids = (
      await prisma.project.findMany({
        where: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        select: { id: true },
      })
    ).map((p) => p.id)
    return ids
  })

  return total
}

async function pruneByType(type: string, validIdsFn: () => Promise<string[]>): Promise<number> {
  const existingDocs = await prisma.chatDocument.findMany({
    where: { type },
    select: { id: true, entityId: true },
  })
  if (existingDocs.length === 0) return 0
  const validIds = new Set(await validIdsFn())
  const toDelete = existingDocs.filter((d) => !validIds.has(d.entityId)).map((d) => d.id)
  if (toDelete.length === 0) return 0
  const { count } = await prisma.chatDocument.deleteMany({ where: { id: { in: toDelete } } })
  return count
}
