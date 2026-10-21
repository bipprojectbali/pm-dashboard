import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { canPreviewDocument, documentPreviewKind, documentResponseHeaders } from '../../../src/lib/document-preview'
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
          'Project-level documents (dokumentasi/artefak/surat) for a project. `state` picks the live rows (default), the trash (soft-deleted, restorable for 30 days), or both. People are reported by id, never email.',
        inputSchema: {
          projectId: z.string(),
          // One tool with a state switch rather than a near-duplicate
          // project_documents_trash_list: same inspectability, half the surface.
          state: z.enum(['live', 'trashed', 'all']).default('live'),
          limit: z.number().int().min(1).max(500).default(200),
        },
      },
      async ({ projectId, state, limit }) => {
        const deletedAt = state === 'live' ? null : state === 'trashed' ? { not: null } : undefined
        const documents = await prisma.projectDocument.findMany({
          where: { projectId, ...(deletedAt === undefined ? {} : { deletedAt }) },
          select: {
            id: true,
            title: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            note: true,
            uploadedById: true,
            createdAt: true,
            deletedAt: true,
          },
          // Trash is read newest-deleted-first, same order the route serves, so
          // the tool and the UI never disagree about what is "top of the trash".
          orderBy: state === 'trashed' ? { deletedAt: 'desc' } : { createdAt: 'desc' },
          take: limit,
        })
        return jsonText({ projectId, state, count: documents.length, documents })
      },
    )

    server.registerTool(
      'project_documents_storage_check',
      {
        title: 'Check project document storage',
        description:
          'For every document row of a project — trashed rows included — report whether its stored object actually exists, so rows orphaned by a failed or partial delete are detectable without opening the UI.',
        inputSchema: {
          projectId: z.string(),
          limit: z.number().int().min(1).max(200).default(100),
        },
      },
      async ({ projectId, limit }) => {
        // Trashed rows are checked too, and their object is EXPECTED to exist:
        // soft-delete keeps the bytes so a restore can work, and only the
        // 30-day retention cron removes them. Filtering them out here, or
        // counting them as orphans, would both report drift that isn't there.
        const rows = await prisma.projectDocument.findMany({
          where: { projectId },
          select: { id: true, title: true, storedName: true, sizeBytes: true, deletedAt: true },
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
                trashed: row.deletedAt !== null,
                key: documentKey(projectId, row.storedName),
                exists: true,
                storedBytes: bytes.length,
                sizeMatches: bytes.length === row.sizeBytes,
              }
            } catch (e) {
              return {
                id: row.id,
                title: row.title,
                trashed: row.deletedAt !== null,
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
          trashedCount: results.filter((r) => r.trashed).length,
          orphanedCount: orphaned.length,
          documents: results,
        })
      },
    )

    server.registerTool(
      'project_document_preview_check',
      {
        title: 'Check document preview and serve headers',
        description:
          'Report whether a document may be rendered inline and the exact Content-Type / Content-Disposition / X-Content-Type-Options the serve route would send. Pass projectId+docId for a stored row, or just mimeType to probe a type that has not been uploaded. Calls the same src/lib/document-preview module the route and the UI call, so it cannot report something the route would not do.',
        inputSchema: {
          projectId: z.string().optional(),
          docId: z.string().optional(),
          // The bare-mimeType mode is the point of the tool on staging: "would
          // a .svg upload render inline?" is answerable without uploading one.
          mimeType: z.string().optional(),
          originalName: z.string().optional(),
        },
      },
      async ({ projectId, docId, mimeType, originalName }) => {
        let row: { title: string; mimeType: string; originalName: string; deletedAt: Date | null } | null = null
        if (projectId && docId) {
          row = await prisma.projectDocument.findFirst({
            where: { id: docId, projectId },
            select: { title: true, mimeType: true, originalName: true, deletedAt: true },
          })
          if (!row) return jsonText({ error: 'Document not found', projectId, docId })
        }
        const mime = row?.mimeType ?? mimeType
        if (!mime) return jsonText({ error: 'Pass projectId+docId, or mimeType' })
        const name = row?.originalName ?? originalName ?? 'document.bin'
        // A trashed row is 404 at the serve route, so the UI offers no preview
        // control for it however previewable its type is. Reported as its own
        // field rather than folded into `previewable`, which stays a pure
        // statement about the type.
        const trashed = row ? row.deletedAt !== null : false
        return jsonText({
          ...(row ? { projectId, docId, title: row.title, trashed } : {}),
          mimeType: mime,
          originalName: name,
          previewKind: documentPreviewKind(mime),
          previewable: canPreviewDocument(mime),
          previewOfferedInUi: canPreviewDocument(mime) && !trashed,
          // The route's own header builder, not a re-description of it — the
          // tool cannot drift from the response a browser actually gets.
          headers: documentResponseHeaders(mime, name),
        })
      },
    )
  },
}
