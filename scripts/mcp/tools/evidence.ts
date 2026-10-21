import { z } from 'zod'
import { prisma } from '../../../src/lib/db'
import { canPreviewDocument, documentPreviewKind } from '../../../src/lib/document-preview'
import {
  evidenceKey,
  evidenceResponseHeaders,
  getEvidence,
  sanitizeEvidenceName,
} from '../../../src/lib/evidence-storage'
import { jsonText, type ToolModule } from './shared'

// Readonly only: evidence is written through the authz-gated HTTP route (and the
// existing task_add_evidence / task_delete_evidence write tools). What is
// missing from the outside is a way to ask what the SERVE route will do with a
// stored file, which is the one decision that can turn an upload into XSS.
export const evidenceReadonly: ToolModule = {
  name: 'evidence-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'evidence_serve_headers_check',
      {
        title: 'Check evidence serve headers',
        description:
          'Report whether GET /api/evidence/:file would render a task-evidence file inline and the exact Content-Type / Content-Disposition / X-Content-Type-Options it sends. Pass taskId+evidenceId for a stored row, or just fileName to probe a name that has not been uploaded (e.g. "would a .svg render inline?"). TaskEvidence has no mimeType column, so the type is derived from the stored extension; this tool calls the same sanitizer and the same header builder the route calls, so it cannot report headers a browser would not receive.',
        inputSchema: {
          taskId: z.string().optional(),
          evidenceId: z.string().optional(),
          // The bare-fileName mode is the point of the tool on staging: an
          // answer about a dangerous extension without uploading one.
          fileName: z.string().optional(),
        },
      },
      async ({ taskId, evidenceId, fileName }) => {
        let row: { kind: string; url: string; note: string | null; taskId: string } | null = null
        if (evidenceId) {
          row = await prisma.taskEvidence.findFirst({
            where: { id: evidenceId, ...(taskId ? { taskId } : {}) },
            select: { kind: true, url: true, note: true, taskId: true },
          })
          if (!row) return jsonText({ error: 'Evidence not found', taskId, evidenceId })
        }
        // Only locally-served evidence has headers to report: a row may equally
        // hold an external URL, which this route never touches.
        const match = row ? row.url.match(/^\/api\/evidence\/([^?]+)/) : null
        if (row && !match) {
          return jsonText({ taskId: row.taskId, evidenceId, url: row.url, servedByRoute: false })
        }
        const requested = match ? (match[1] as string) : fileName
        if (!requested) return jsonText({ error: 'Pass taskId+evidenceId, or fileName' })
        // The route's own sanitizer, so `storedName` is the name the lookup and
        // the headers below are really computed from.
        const storedName = sanitizeEvidenceName(requested)
        const headers = evidenceResponseHeaders(storedName)
        // The derived type, reported so a surprising inline/attachment answer
        // can be traced to the extension mapping rather than guessed at.
        const derivedMimeType = Bun.file(storedName).type
        let exists: boolean | undefined
        let storedBytes: number | undefined
        if (row) {
          // Read bytes rather than exists(): MinIO's HEAD reply makes Bun's
          // exists() throw while a plain GET works, which is what the serve
          // route itself relies on — so this check and the route agree. A miss
          // here only means the file may still be on the legacy disk path.
          try {
            storedBytes = (await getEvidence(row.taskId, storedName).bytes()).length
            exists = true
          } catch {
            exists = false
          }
        }
        return jsonText({
          ...(row
            ? {
                taskId: row.taskId,
                evidenceId,
                kind: row.kind,
                note: row.note,
                servedByRoute: true,
                key: evidenceKey(row.taskId, storedName),
                existsInObjectStorage: exists,
                storedBytes,
              }
            : {}),
          requested,
          storedName,
          derivedMimeType,
          previewKind: documentPreviewKind(derivedMimeType),
          inline: canPreviewDocument(derivedMimeType),
          // The route's own header builder, not a re-description of it.
          headers,
        })
      },
    )
  },
}
