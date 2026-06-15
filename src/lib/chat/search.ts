import { prisma } from '../db'
import {
  extractKeywords,
  generateEmbedding,
  getEmbeddingSettings,
  MIN_SEMANTIC_HITS,
  SEMANTIC_MIN_SIMILARITY,
} from './embedding'

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
