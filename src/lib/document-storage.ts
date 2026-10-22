import { extname } from 'node:path'
import type { S3File } from 'bun'
import { client, ensureBucket } from './evidence-storage'

// Project-level documents in MinIO/S3. Deliberately a separate module from
// `evidence-storage.ts`: that one is named for the evidence domain and owns the
// `evidence/<taskId>/...` key layout, and growing it with a second domain is how
// a storage module turns into a junk drawer. The S3 client and the bucket
// bootstrap are shared from there, only the key layout differs.
//
// Bucket must stay PRIVATE — access control is the auth-gated proxy
// (GET /api/projects/:id/documents/:docId/file), never an object ACL.

/** `documents/<projectId>/<storedName>` — project-scoped, so one project's
 * objects are listable/prunable on their own. */
export function documentKey(projectId: string, storedName: string): string {
  return `documents/${projectId}/${storedName}`
}

/**
 * Extension to keep from a client-supplied filename: at most 12 characters and
 * only `[A-Za-z0-9.]`, same rule the evidence upload applies. Strips the path
 * separators, `..` and NUL bytes that would otherwise let a crafted filename
 * steer the object key.
 */
export function documentExtension(originalName: string): string {
  return extname(originalName)
    .slice(0, 12)
    .replace(/[^a-zA-Z0-9.]/g, '')
}

/**
 * Storage name for an upload: a fresh UUID plus the sanitised extension. The
 * client filename is never the key — it is kept verbatim in
 * `ProjectDocument.originalName`, which is display data, not a path.
 */
export function buildStoredName(originalName: string): string {
  return `${crypto.randomUUID()}${documentExtension(originalName)}`
}

export async function putDocument(
  projectId: string,
  storedName: string,
  data: Blob | ArrayBuffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await ensureBucket()
  await client.write(documentKey(projectId, storedName), data, contentType ? { type: contentType } : undefined)
}

/** Lazy reference — caller reads bytes and treats a throw as "missing". */
export function getDocument(projectId: string, storedName: string): S3File {
  return client.file(documentKey(projectId, storedName))
}

/** Best-effort delete — never throws, so removing the row always succeeds even
 * if storage is unreachable (an orphaned object is recoverable, a row that
 * cannot be deleted is a stuck UI). `project_documents_storage_check` in MCP
 * surfaces the opposite drift, rows whose object is gone. */
export async function removeDocument(projectId: string, storedName: string): Promise<void> {
  await client.delete(documentKey(projectId, storedName)).catch(() => {})
}
