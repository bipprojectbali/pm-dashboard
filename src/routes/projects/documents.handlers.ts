import { prisma } from '../../lib/db'
import { buildStoredName, getDocument, putDocument, removeDocument } from '../../lib/document-storage'
import { env } from '../../lib/env'
import { emitInvalidate } from '../../lib/presence'
import { canManageProject, getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { type CtxWithDoc, type CtxWithId, documentSelect, gateRead, serialize } from './documents.shared'

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
  // `deletedAt: null` by hand, deliberately not by extending `withSoftDelete`:
  // that extension is hardcoded to Task and generalising it drags in the traps
  // its own comment documents (relation counts, nested includes). There are
  // only three document read sites, so three explicit clauses are the smaller
  // and more honest fix.
  const documents = await prisma.projectDocument.findMany({
    where: { projectId: params.id, deletedAt: null },
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
  // A trashed document must 404 here even though its object is still in the
  // bucket for a restore — a download that keeps working would make the trash
  // cosmetic.
  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id, deletedAt: null },
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
    where: { id: params.docId, projectId: params.id, deletedAt: null },
    select: { id: true, uploadedById: true },
  })
  if (!doc) {
    set.status = 404
    return { error: 'Document not found' }
  }
  // Uploader-or-manager, not "any writable member": trashing someone else's
  // official letter still hides it from the project, and a plain MEMBER has no
  // standing to decide that. The uploader may undo their own mistake; beyond
  // that it is an OWNER/PM call.
  if (!canManageProject(auth, gate.membership) && doc.uploadedById !== auth.userId) {
    set.status = 403
    return { error: 'Hanya pengunggah, OWNER/PM, atau admin sistem yang bisa menghapus dokumen' }
  }
  // Soft-delete, and the object STAYS: restore needs those bytes, and the
  // retention cron is the only thing that ever removes them. Writing on a
  // locked project is refused at the data layer (`projectDocument` is in
  // GUARDED_MODELS), so there is no extra lock check here.
  await prisma.projectDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } })
  writeAuditLog(
    auth.userId,
    'PROJECT_DOCUMENT_DELETED',
    `project=${params.id} document=${doc.id} uploader=${doc.uploadedById}`,
    getIp(request),
  )
  emitInvalidate('project-documents', { projectId: params.id })
  return { ok: true }
}
