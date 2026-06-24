// RAG knowledge base: sync project entities → ChatDocument, search at query time.
// Sub-modules: src/lib/chat/{embedding,search,upsert,sync-*,prune}.ts

import { prisma } from './db'
import { getEmbeddingSettings } from './chat/embedding'
import { pruneOrphanDocs } from './chat/prune'
import { syncUsers, syncTasks } from './chat/sync-users-tasks'
import { syncProjects, syncGithub } from './chat/sync-projects-github'
import { syncMilestones, syncExtensions, syncDependencies, syncEvidence } from './chat/sync-milestones-ext'
import { syncEvents, syncComments, syncAuditLogs, syncReportHistory } from './chat/sync-activity'
import { syncProjectRetro } from './chat/sync-retro'
import type { SyncCtx } from './chat/upsert'

// Re-exports for consumers (no import-path changes needed in chat.ts, routes, mcp, tests)
export { extractKeywords, invalidateEmbeddingCache } from './chat/embedding'
export type { DocHit, SearchResult } from './chat/search'
export { searchDocuments } from './chat/search'

export interface SyncResult {
  synced: number
  pruned: number
  failedEmbeddings: number
}

export async function getChatSyncStatus() {
  const [total, byType, latest] = await Promise.all([
    prisma.chatDocument.count(),
    prisma.chatDocument.groupBy({ by: ['type'], _count: true }),
    prisma.chatDocument.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } }),
  ])
  const breakdown = Object.fromEntries(byType.map((r) => [r.type, r._count]))
  return { totalDocuments: total, lastSync: latest?.syncedAt ?? null, breakdown }
}

export async function syncChatDocuments(opts: { full?: boolean } = {}): Promise<SyncResult> {
  const embSettings = (await getEmbeddingSettings()) ?? undefined

  const since = opts.full
    ? null
    : await prisma.chatDocument
        .findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } })
        .then((r) => r?.syncedAt ?? null)

  const counters = { synced: 0, failedEmbeddings: 0 }
  const now = new Date()
  const ctx: SyncCtx = {
    embSettings,
    counters,
    since,
    now,
    cutoff30d: new Date(now.getTime() - 30 * 86_400_000),
    cutoff7d: new Date(now.getTime() - 7 * 86_400_000),
  }

  await syncUsers(ctx)
  await syncTasks(ctx)
  await syncProjects(ctx)
  await syncEvents(ctx)
  await syncComments(ctx)
  await syncGithub(ctx)
  await syncMilestones(ctx)
  await syncExtensions(ctx)
  await syncDependencies(ctx)
  await syncEvidence(ctx)
  await syncAuditLogs(ctx)
  await syncReportHistory(ctx)

  if (opts.full) {
    await syncProjectRetro(ctx)
  }

  const pruned = opts.full ? await pruneOrphanDocs() : 0

  return { synced: counters.synced, pruned, failedEmbeddings: counters.failedEmbeddings }
}
