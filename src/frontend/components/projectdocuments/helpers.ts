import type { ApiError } from '../ProjectDetailView/types'
import { computeCanManage, isSystemAdmin } from '../ProjectDetailView/types'

export interface ProjectDocument {
  id: string
  projectId: string
  title: string
  originalName: string
  mimeType: string
  sizeBytes: number
  note: string | null
  createdAt: string
  uploadedBy: { id: string; name: string } | null
  /** `/api/projects/:projectId/documents/:id/file` — served by the API, not a bucket URL. */
  url: string
}

export interface DocumentPermissionCtx {
  myRole: string | null
  systemRole: string | null | undefined
  currentUserId: string | null
  /**
   * From the project detail payload (`isAdmin || (member && !locked)`), so it
   * already carries the overdue-lock freeze. AND-ing it keeps the UI from
   * offering a write the data-layer lock guard would reject anyway.
   */
  canWrite: boolean
}

/** Mirrors the server: any member whose role is not VIEWER, or a system admin. */
export function canUploadDocument(ctx: DocumentPermissionCtx): boolean {
  if (!ctx.canWrite) return false
  if (isSystemAdmin(ctx.systemRole)) return true
  return ctx.myRole != null && ctx.myRole !== 'VIEWER'
}

/** Mirrors the server: OWNER/PM/system admin, or whoever uploaded that document. */
export function canDeleteDocument(doc: Pick<ProjectDocument, 'uploadedBy'>, ctx: DocumentPermissionCtx): boolean {
  if (!ctx.canWrite) return false
  if (computeCanManage(ctx.myRole, ctx.systemRole)) return true
  return ctx.currentUserId != null && doc.uploadedBy?.id === ctx.currentUserId
}

export type DocumentKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'archive' | 'other'

/** Coarse bucket for the row icon — enough to tell a surat from a screenshot at a glance. */
export function documentKind(mimeType: string): DocumentKind {
  const m = mimeType.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet'
  if (m.includes('word') || m.startsWith('text/')) return 'doc'
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) return 'archive'
  return 'other'
}

const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB']

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString('id-ID', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${SIZE_UNITS[unit]}`
}

/**
 * 413 and 400 are the two upload failures the user can actually act on, and the
 * server's own message for them is not necessarily readable — translate by
 * status, fall back to whatever the server said.
 */
export function uploadErrorMessage(err: unknown): string {
  const status = (err as ApiError | null)?.status
  if (status === 413) return 'Berkas terlalu besar. Perkecil atau pecah berkasnya, lalu unggah lagi.'
  if (status === 400) return 'Berkas kosong atau tidak terbaca. Pilih berkas lain.'
  if (err instanceof Error && err.message) return err.message
  return 'Gagal mengunggah dokumen.'
}
