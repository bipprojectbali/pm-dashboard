import { describe, expect, test } from 'bun:test'
import {
  canDeleteDocument,
  canUploadDocument,
  type DocumentPermissionCtx,
  documentKind,
  formatFileSize,
  uploadErrorMessage,
} from '../../src/frontend/components/projectdocuments/helpers'

function ctx(over: Partial<DocumentPermissionCtx> = {}): DocumentPermissionCtx {
  return { myRole: 'MEMBER', systemRole: 'USER', currentUserId: 'u1', canWrite: true, ...over }
}

const uploadedBy = (id: string | null) => ({ uploadedBy: id ? { id, name: 'X' } : null })

describe('canUploadDocument', () => {
  test('member above VIEWER may upload', () => {
    expect(canUploadDocument(ctx({ myRole: 'MEMBER' }))).toBe(true)
    expect(canUploadDocument(ctx({ myRole: 'PM' }))).toBe(true)
    expect(canUploadDocument(ctx({ myRole: 'OWNER' }))).toBe(true)
  })

  test('VIEWER and non-member may not', () => {
    expect(canUploadDocument(ctx({ myRole: 'VIEWER' }))).toBe(false)
    expect(canUploadDocument(ctx({ myRole: null }))).toBe(false)
  })

  test('system admin may upload even without a membership role', () => {
    expect(canUploadDocument(ctx({ myRole: null, systemRole: 'ADMIN' }))).toBe(true)
    expect(canUploadDocument(ctx({ myRole: null, systemRole: 'SUPER_ADMIN' }))).toBe(true)
  })

  test('a frozen project (canWrite=false) offers no upload to anyone', () => {
    expect(canUploadDocument(ctx({ myRole: 'OWNER', canWrite: false }))).toBe(false)
    expect(canUploadDocument(ctx({ systemRole: 'ADMIN', canWrite: false }))).toBe(false)
  })
})

describe('canDeleteDocument', () => {
  test('OWNER/PM/system admin may delete anyone’s document', () => {
    expect(canDeleteDocument(uploadedBy('other'), ctx({ myRole: 'OWNER' }))).toBe(true)
    expect(canDeleteDocument(uploadedBy('other'), ctx({ myRole: 'PM' }))).toBe(true)
    expect(canDeleteDocument(uploadedBy('other'), ctx({ myRole: null, systemRole: 'ADMIN' }))).toBe(true)
  })

  test('plain member may delete only their own upload', () => {
    expect(canDeleteDocument(uploadedBy('u1'), ctx({ myRole: 'MEMBER' }))).toBe(true)
    expect(canDeleteDocument(uploadedBy('other'), ctx({ myRole: 'MEMBER' }))).toBe(false)
  })

  test('an orphaned upload is not deletable by a plain member', () => {
    expect(canDeleteDocument(uploadedBy(null), ctx({ myRole: 'MEMBER' }))).toBe(false)
    expect(canDeleteDocument(uploadedBy(null), ctx({ myRole: 'MEMBER', currentUserId: null }))).toBe(false)
  })

  test('a frozen project offers no delete', () => {
    expect(canDeleteDocument(uploadedBy('u1'), ctx({ myRole: 'OWNER', canWrite: false }))).toBe(false)
  })
})

describe('documentKind', () => {
  test('buckets the mime types that matter', () => {
    expect(documentKind('image/png')).toBe('image')
    expect(documentKind('application/pdf')).toBe('pdf')
    expect(documentKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet')
    expect(documentKind('text/csv')).toBe('sheet')
    expect(documentKind('application/msword')).toBe('doc')
    expect(documentKind('text/plain')).toBe('doc')
    expect(documentKind('application/zip')).toBe('archive')
    expect(documentKind('application/octet-stream')).toBe('other')
  })

  test('is case-insensitive', () => {
    expect(documentKind('APPLICATION/PDF')).toBe('pdf')
  })
})

describe('formatFileSize', () => {
  test('bytes stay bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  test('scales up and uses the Indonesian decimal comma', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1,5 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3 GB')
  })

  test('drops the fraction once the number is big enough not to need it', () => {
    expect(formatFileSize(15.5 * 1024)).toBe('16 KB')
  })

  test('nonsense sizes degrade to a dash instead of NaN', () => {
    expect(formatFileSize(-1)).toBe('—')
    expect(formatFileSize(Number.NaN)).toBe('—')
  })
})

describe('uploadErrorMessage', () => {
  test('413 and 400 become actionable Indonesian copy', () => {
    const tooBig = Object.assign(new Error('Payload too large'), { status: 413 })
    const empty = Object.assign(new Error('empty file'), { status: 400 })
    expect(uploadErrorMessage(tooBig)).toContain('terlalu besar')
    expect(uploadErrorMessage(empty)).toContain('kosong')
  })

  test('other failures keep the server message', () => {
    const forbidden = Object.assign(new Error('Tidak punya akses'), { status: 403 })
    expect(uploadErrorMessage(forbidden)).toBe('Tidak punya akses')
  })

  test('a non-Error failure still yields a readable message', () => {
    expect(uploadErrorMessage(undefined)).toBe('Gagal mengunggah dokumen.')
  })
})
