import { prisma } from '../../lib/db'
import { buildStoredName, getDocument, putDocument, removeDocument } from '../../lib/document-storage'
import { env } from '../../lib/env'
import { emitInvalidate } from '../../lib/presence'
import { LOCKED_WRITE_MESSAGE } from '../../lib/prisma-project-lock'
import {
  canManageProject,
  canReadProject,
  getIp,
  isSystemAdmin,
  type ProjectRole,
  requireAuth,
  writeAuditLog,
} from '../../lib/route-helpers'

type Ctx = { request: Request; set: { status?: number | string } }
type CtxWithId = Ctx & { params: { id: string } }
type CtxWithDoc = Ctx & { params: { id: string; docId: string } }

const documentSelect = {
  id: true,
  projectId: true,
  title: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  note: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const

type DocumentRow = {
  id: string
  projectId: string
  title: string
  originalName: string
  mimeType: string
  sizeBytes: number
  note: string | null
  createdAt: Date
  uploadedBy: { id: string; name: string } | null
}

// `url` is the auth-gated proxy route, never a direct storage URL — the bucket
// is private and access is decided per request, not by a signed link.
function serialize(doc: DocumentRow) {
  return {
    id: doc.id,
    projectId: doc.projectId,
    title: doc.title,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    note: doc.note,
    createdAt: doc.createdAt,
    uploadedBy: doc.uploadedBy,
    url: `/api/projects/${doc.projectId}/documents/${doc.id}/file`,
  }
}

type Gate =
  | { ok: false; status: 403 | 404; body: Record<string, unknown> }
  | { ok: true; membership: { role: ProjectRole } | null; admin: boolean }

/**
 * Read gate for every document route: `canReadProject` with NO options, so an
 * overdue-locked project serves nothing to anyone but a system admin — the
 * OWNER decision carve-out belongs to GET /api/projects/:id alone, and letting
 * it through here would keep handing out the files the lock is meant to freeze.
 *
 * Membership (or system admin) is required on top of it, like the evidence
 * serve route: a project's documents are its artefacts and official letters,
 * not the summary data an INTERNAL project shows any logged-in user.
 */
async function gateRead(projectId: string, auth: { userId: string; role: string }): Promise<Gate> {
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

export async function listProjectDocumentsHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const gate = await gateRead(params.id, auth)
  if (!gate.ok) {
    set.status = gate.status
    return gate.body
  }
  const documents = await prisma.projectDocument.findMany({
    where: { projectId: params.id },
    select: documentSelect,
    orderBy: { createdAt: 'desc' },
  })
  return { documents: documents.map(serialize) }
}

export async function uploadProjectDocumentHandler({ request, params, set }: CtxWithId) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const gate = await gateRead(params.id, auth)
  if (!gate.ok) {
    set.status = gate.status
    return gate.body
  }
  // Effective role, so a locked project's VIEWER downgrade would reject here
  // too even if the read gate above ever grew a carve-out.
  if (gate.membership?.role === 'VIEWER' && !gate.admin) {
    set.status = 403
    return { error: 'Not a writable project member' }
  }
  const form = await request.formData()
  const file = form.get('file')
  const rawTitle = form.get('title')
  const rawNote = form.get('note')
  if (!(file instanceof File)) {
    set.status = 400
    return { error: 'file wajib diupload (field name: file)' }
  }
  if (file.size === 0) {
    set.status = 400
    return { error: 'File kosong' }
  }
  if (file.size > env.UPLOAD_MAX_BYTES) {
    set.status = 413
    return { error: `File terlalu besar (max ${env.UPLOAD_MAX_BYTES} bytes)` }
  }
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : file.name
  const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null
  const storedName = buildStoredName(file.name)
  const mimeType = file.type || 'application/octet-stream'
  // Object first: a stored object with no row is detectable orphan garbage,
  // while a row with no object is a download that 404s for good.
  await putDocument(params.id, storedName, file, mimeType)
  let created: { id: string }
  try {
    created = await prisma.projectDocument.create({
      data: {
        projectId: params.id,
        title,
        storedName,
        originalName: file.name,
        mimeType,
        sizeBytes: file.size,
        note,
        uploadedById: auth.userId,
      },
      select: { id: true },
    })
  } catch (e) {
    // Including the data-layer overdue-lock refusal: drop the orphan we just
    // wrote, then let the error reach app.ts's 403 { locked: true } mapping.
    await removeDocument(params.id, storedName)
    throw e
  }
  const document = await prisma.projectDocument.findUniqueOrThrow({
    where: { id: created.id },
    select: documentSelect,
  })
  // People by id, never email or name — the row itself carries uploadedById.
  writeAuditLog(
    auth.userId,
    'PROJECT_DOCUMENT_UPLOADED',
    `project=${params.id} document=${created.id} size=${file.size} mime=${mimeType}`,
    getIp(request),
  )
  emitInvalidate('project-documents', { projectId: params.id })
  return { document: serialize(document) }
}

export async function serveProjectDocumentHandler({ request, params, set }: CtxWithDoc) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const gate = await gateRead(params.id, auth)
  if (!gate.ok) {
    set.status = gate.status
    return gate.body
  }
  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { storedName: true, mimeType: true },
  })
  if (!doc) {
    set.status = 404
    return { error: 'Document not found' }
  }
  // Read the object directly instead of exists()-then-get: MinIO's HEAD reply
  // makes Bun's exists() throw while a plain GET works. A missing key throws
  // NoSuchKey, which is a 404 — there is no legacy on-disk layout to fall back
  // to, this feature was never on disk.
  try {
    const bytes = await getDocument(params.id, doc.storedName).bytes()
    return new Response(bytes, { headers: { 'Content-Type': doc.mimeType } })
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'NoSuchKey' || code === 'ERR_S3_INVALID_PATH') {
      set.status = 404
      return { error: 'File not found' }
    }
    set.status = 502
    return { error: 'Storage unavailable' }
  }
}

export async function deleteProjectDocumentHandler({ request, params, set }: CtxWithDoc) {
  const auth = await requireAuth(request)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const gate = await gateRead(params.id, auth)
  if (!gate.ok) {
    set.status = gate.status
    return gate.body
  }
  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true, storedName: true, uploadedById: true },
  })
  if (!doc) {
    set.status = 404
    return { error: 'Document not found' }
  }
  // Uploader-or-manager, not "any writable member": deleting someone else's
  // official letter destroys the traceability this table exists for, and a
  // plain MEMBER has no standing to decide that. The uploader may undo their
  // own mistake; beyond that it is an OWNER/PM call.
  if (!canManageProject(auth, gate.membership) && doc.uploadedById !== auth.userId) {
    set.status = 403
    return { error: 'Hanya pengunggah, OWNER/PM, atau admin sistem yang bisa menghapus dokumen' }
  }
  await removeDocument(params.id, doc.storedName)
  await prisma.projectDocument.delete({ where: { id: doc.id } })
  writeAuditLog(
    auth.userId,
    'PROJECT_DOCUMENT_DELETED',
    `project=${params.id} document=${doc.id} uploader=${doc.uploadedById}`,
    getIp(request),
  )
  emitInvalidate('project-documents', { projectId: params.id })
  return { ok: true }
}
