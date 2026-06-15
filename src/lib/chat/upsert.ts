import { prisma } from '../db'
import { type getEmbeddingSettings, generateEmbedding } from './embedding'

export function fmtDate(d: Date | string | null): string {
  if (!d) return 'tidak ada'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysAgo(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

export interface UpsertOpts {
  type: string
  entityId: string
  title: string
  content: string
  tags?: string
  projectId?: string | null
}

export interface SyncCounters {
  synced: number
  failedEmbeddings: number
}

export interface SyncCtx {
  embSettings: Awaited<ReturnType<typeof getEmbeddingSettings>> | undefined
  counters: SyncCounters
  since: Date | null
  now: Date
  cutoff30d: Date
  cutoff7d: Date
}

export async function upsertDoc(
  opts: UpsertOpts,
  embSettings: Awaited<ReturnType<typeof getEmbeddingSettings>> | undefined,
  counters: SyncCounters,
): Promise<void> {
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
