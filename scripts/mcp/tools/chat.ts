import { z } from 'zod'
import { getChatSyncStatus, searchDocuments, syncChatDocuments } from '../../../src/lib/chat-documents'
import { jsonText, type ToolModule } from './shared'

export const chatReadonly: ToolModule = {
  name: 'chat-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'chat_doc_search',
      {
        title: 'Search chat knowledge base',
        description:
          'Cari dokumen RAG (user, task, project, event, github_project, effort_user, effort_task, ghost_task, milestone, extension, dependency, evidence, audit_recent, agent_status, report_history, project_retro, comment) via pgvector (semantik) + FTS + trigram. Return hits dengan metadata (ref, type, entityId, title, content). Gunakan untuk verifikasi sumber jawaban Chat AI.',
        inputSchema: {
          query: z.string().min(2).describe('Pertanyaan / kata kunci (id atau en)'),
          limit: z.number().int().min(1).max(20).default(6),
          type: z
            .string()
            .optional()
            .describe('Filter satu type doc, e.g. "task", "effort_user", "github_project"'),
        },
      },
      async ({ query, limit, type }) => {
        const result = await searchDocuments(query, limit, type)
        return jsonText({
          query,
          type: type ?? null,
          count: result.hits.length,
          hits: result.hits,
        })
      },
    )

    server.registerTool(
      'chat_doc_stats',
      {
        title: 'Chat knowledge base stats',
        description:
          'Total dokumen di chat_document, breakdown per type, dan lastSync timestamp. Gunakan untuk cek freshness knowledge base.',
        inputSchema: {},
      },
      async () => jsonText(await getChatSyncStatus()),
    )
  },
}

export const chatAdmin: ToolModule = {
  name: 'chat-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'chat_sync_run',
      {
        title: 'Trigger chat knowledge base sync',
        description:
          'Jalankan sync chat_document — incremental (default) atau full. Full mencakup project_retro + orphan prune (lebih lambat). Return { synced, pruned, failedEmbeddings }.',
        inputSchema: {
          full: z
            .boolean()
            .default(false)
            .describe('true = full re-sync + prune orphan; false = incremental sejak last syncedAt'),
        },
      },
      async ({ full }) => {
        const start = Date.now()
        const result = await syncChatDocuments({ full })
        return jsonText({ ...result, full, durationMs: Date.now() - start })
      },
    )
  },
}
