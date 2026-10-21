import { LOCKED_WRITE_MESSAGE } from '../../lib/prisma-project-lock'
import { canReadProject, isSystemAdmin, type ProjectRole } from '../../lib/route-helpers'

// Pieces shared by the live-document handlers and the trash handlers. Both
// surfaces must answer identically about who may see a project's documents, so
// the read gate and the row shape live in one place instead of being mirrored.

export type Ctx = { request: Request; set: { status?: number | string } }
export type CtxWithId = Ctx & { params: { id: string } }
export type CtxWithDoc = Ctx & { params: { id: string; docId: string } }

export const documentSelect = {
  id: true,
  projectId: true,
  title: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  note: true,
  createdAt: true,
  deletedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const

export type DocumentRow = {
  id: string
  projectId: string
  title: string
  originalName: string
  mimeType: string
  sizeBytes: number
  note: string | null
  createdAt: Date
  deletedAt: Date | null
  uploadedBy: { id: string; name: string } | null
}

// `url` is the auth-gated proxy route, never a direct storage URL — the bucket
// is private and access is decided per request, not by a signed link. For a
// trashed row it 404s on purpose: the object is still there for a restore, but
// a document in the trash must not be downloadable.
export function serialize(doc: DocumentRow) {
  return {
    id: doc.id,
    projectId: doc.projectId,
    title: doc.title,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    note: doc.note,
    createdAt: doc.createdAt,
    deletedAt: doc.deletedAt,
    uploadedBy: doc.uploadedBy,
    url: `/api/projects/${doc.projectId}/documents/${doc.id}/file`,
  }
}

export type Gate =
  | { ok: false; status: 403 | 404; body: Record<string, unknown> }
  | { ok: true; membership: { role: ProjectRole } | null; admin: boolean }

/**
 * Read gate for every document route, trash included: `canReadProject` with NO
 * options, so an overdue-locked project serves nothing to anyone but a system
 * admin — the OWNER decision carve-out belongs to GET /api/projects/:id alone,
 * and letting it through here would keep handing out the files the lock is meant
 * to freeze. The lock screen does not need a trash listing to decide anything.
 *
 * Membership (or system admin) is required on top of it, like the evidence
 * serve route: a project's documents are its artefacts and official letters,
 * not the summary data an INTERNAL project shows any logged-in user.
 */
export async function gateRead(projectId: string, auth: { userId: string; role: string }): Promise<Gate> {
  const access = await canReadProject(projectId, auth)
  if (!access.ok) {
    if (access.status === 404) return { ok: false, status: 404, body: { error: 'Project not found' } }
    // Surface the lock so the client renders the lock screen instead of a bare
    // "no access" — same { locked: true } shape the data-layer guard returns.
    return access.lock?.locked
      ? { ok: false, status: 403, body: { error: LOCKED_WRITE_MESSAGE, locked: true, projectId } }
      : { ok: false, status: 403, body: { error: 'Project not accessible' } }
  }
  const admin = isSystemAdmin(auth.role)
  if (!access.membership && !admin) return { ok: false, status: 403, body: { error: 'Not a project member' } }
  return { ok: true, membership: access.membership, admin }
}
