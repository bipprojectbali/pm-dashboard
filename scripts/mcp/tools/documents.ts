import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { documentKey, getDocument } from '../../../src/lib/document-storage'
import { jsonText, type ToolModule } from './shared'

// Readonly only: project documents are written through the authz-gated HTTP
// route, and registering a write tool here would hand staging (where
// NODE_ENV=production forces the readonly scope) nothing but a dead symbol.
export const documentsReadonly: ToolModule = {
  name: 'documents-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'project_documents_list',
      {
        title: 'List project documents',
        description:
          'Project-level documents (dokumentasi/artefak/surat) for a project, newest first. People are reported by id, never email.',
        inputSchema: {
          projectId: z.string(),
          limit: z.number().int().min(1).max(500).default(200),
        },
      },
      async ({ projectId, limit }) => {
        const documents = await prisma.projectDocument.findMany({
          where: { projectId },
          select: {
            id: true,
            title: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            note: true,
            uploadedById: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
        return jsonText({ projectId, count: documents.length, documents })
      },
    )

    server.registerTool(
      'project_documents_storage_check',
      {
        title: 'Check project document storage',
        description:
          'For every document row of a project, report whether its stored object actually exists — so rows orphaned by a failed or partial delete are detectable without opening the UI.',
        inputSchema: {
          projectId: z.string(),
          limit: z.number().int().min(1).max(200).default(100),
        },
      },
      async ({ projectId, limit }) => {
        const rows = await prisma.projectDocument.findMany({
          where: { projectId },
          select: { id: true, title: true, storedName: true, sizeBytes: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
        const results = await Promise.all(
          rows.map(async (row) => {
            // Read bytes rather than exists(): MinIO's HEAD reply makes Bun's
            // exists() throw while a plain GET works, which is exactly what the
            // serve route relies on — so this check and the route agree.
            try {
              const bytes = await getDocument(projectId, row.storedName).bytes()
              return {
                id: row.id,
                title: row.title,
                key: documentKey(projectId, row.storedName),
                exists: true,
                storedBytes: bytes.length,
                sizeMatches: bytes.length === row.sizeBytes,
              }
            } catch (e) {
              return {
                id: row.id,
                title: row.title,
                key: documentKey(projectId, row.storedName),
                exists: false,
                error: (e as { code?: string }).code ?? (e as Error).message,
              }
            }
          }),
        )
        const orphaned = results.filter((r) => !r.exists)
        return jsonText({
          projectId,
          count: results.length,
          orphanedCount: orphaned.length,
          documents: results,
        })
      },
    )
  },
}
