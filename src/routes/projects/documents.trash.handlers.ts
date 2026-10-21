import { prisma } from '../../lib/db'
import { emitInvalidate } from '../../lib/presence'
import { canManageProject, getIp, requireAuth, writeAuditLog } from '../../lib/route-helpers'
import { type CtxWithDoc, type CtxWithId, documentSelect, gateRead, serialize } from './documents.shared'

/**
 * Who may pull a document back out of the trash: a system admin, the person who
 * uploaded it, or an OWNER/PM. Same shape as the task restore rule in
 * `tasks/trash.helpers.ts` and the same rule as the delete that put it there —
 * whoever could trash it can undo it, and nobody else gets to resurrect a
 * document the project leads chose to file away.
 */
function canRestoreDocument(
  auth: { userId: string; role: string },
  membership: { role: 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' } | null,
  doc: { uploadedById: string },
): boolean {
  return canManageProject(auth, membership) || doc.uploadedById === auth.userId
}

/**
 * Trash listing. Gated by the very same `gateRead` the live routes use, so a
 * locked project hands out nothing here either. Listing is open to any member —
 * restoring is not; a member who may not restore simply sees no action.
 */
export async function listTrashedProjectDocumentsHandler({ request, params, set }: CtxWithId) {
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
    where: { projectId: params.id, deletedAt: { not: null } },
    select: documentSelect,
    orderBy: { deletedAt: 'desc' },
  })
  return { documents: documents.map(serialize) }
}

export async function restoreProjectDocumentHandler({ request, params, set }: CtxWithDoc) {
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
  // Looked up without a `deletedAt` clause on purpose: "not in the trash" and
  // "does not exist" are different answers to the caller, 400 versus 404.
  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true, uploadedById: true, deletedAt: true },
  })
  if (!doc) {
    set.status = 404
    return { error: 'Document not found' }
  }
  if (!doc.deletedAt) {
    set.status = 400
    return { error: 'Dokumen ini tidak ada di tempat sampah' }
  }
  if (!canRestoreDocument(auth, gate.membership, doc)) {
    set.status = 403
    return { error: 'Hanya pengunggah, OWNER/PM, atau admin sistem yang bisa memulihkan dokumen' }
  }
  // Write on a locked project is refused at the data layer (`projectDocument`
  // is in GUARDED_MODELS) — no second lock check, and no bypass.
  const document = await prisma.projectDocument.update({
    where: { id: doc.id },
    data: { deletedAt: null },
    select: documentSelect,
  })
  writeAuditLog(
    auth.userId,
    'PROJECT_DOCUMENT_RESTORED',
    `project=${params.id} document=${doc.id} uploader=${doc.uploadedById}`,
    getIp(request),
  )
  emitInvalidate('project-documents', { projectId: params.id })
  return { document: serialize(document) }
}
