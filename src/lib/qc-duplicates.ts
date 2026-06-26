import { prisma } from './db'
import { AI_QUEUE_TAG, getSelfProject } from './self-project'

export interface SimilarTicket {
  id: string
  title: string
  status: string
  priority: string
  score: number
}

interface FindSimilarOptions {
  title: string
  limit?: number
  threshold?: number
}

// Trigram-based duplicate detection over open ai-queue tickets in the self-project.
// Reuses the pg_trgm `similarity()` pattern from chat/search.ts. Returns [] when no
// self-project is set or pg_trgm is unavailable — never throws to the caller.
export async function findSimilarTickets({
  title,
  limit = 5,
  threshold = 0.3,
}: FindSimilarOptions): Promise<SimilarTicket[]> {
  const trimmed = title.trim()
  if (!trimmed) return []
  const self = await getSelfProject()
  if (!self) return []

  const cap = Math.min(Math.max(limit, 1), 20)
  try {
    return await prisma.$queryRaw<SimilarTicket[]>`
      SELECT t.id, t.title, t.status::text AS status, t.priority::text AS priority,
             similarity(t.title, ${trimmed}) AS score
      FROM "task" t
      JOIN "task_tag" tt ON tt."taskId" = t.id
      JOIN "tag" g ON g.id = tt."tagId"
      WHERE t."projectId" = ${self.id}
        AND g.name = ${AI_QUEUE_TAG}
        AND t.status <> 'CLOSED'
        AND similarity(t.title, ${trimmed}) > ${threshold}
      ORDER BY score DESC
      LIMIT ${cap}
    `
  } catch {
    return []
  }
}
