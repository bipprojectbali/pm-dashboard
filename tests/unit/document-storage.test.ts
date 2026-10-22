// Pure helpers of src/lib/document-storage.ts. The storage calls themselves are
// covered end-to-end by tests/integration/project-documents.test.ts against the
// real bucket; what matters here is that a client-supplied filename can never
// steer the object key.
import { describe, expect, test } from 'bun:test'
import { buildStoredName, documentExtension, documentKey } from '../../src/lib/document-storage'

describe('documentKey', () => {
  test('scopes the object under the project', () => {
    expect(documentKey('p1', 'abc.pdf')).toBe('documents/p1/abc.pdf')
  })

  test('is distinct from the evidence layout', () => {
    expect(documentKey('p1', 'abc.pdf').startsWith('documents/')).toBe(true)
  })
})

describe('documentExtension', () => {
  test('keeps a normal extension', () => {
    expect(documentExtension('surat-tugas.pdf')).toBe('.pdf')
  })

  test('returns empty for a name without extension', () => {
    expect(documentExtension('README')).toBe('')
  })

  test('strips path separators so a traversal attempt cannot escape the prefix', () => {
    // extname() of this is "../../../etc/passwd"-ish; whatever it yields must
    // contain no slash and no dot-dot run that could climb the key space.
    const ext = documentExtension('../../etc/passwd.sh')
    expect(ext).toBe('.sh')
    expect(ext).not.toContain('/')
  })

  test('drops characters that are not alphanumeric or dot', () => {
    expect(documentExtension('x.p df')).toBe('.pdf')
    expect(documentExtension('x.p\u0000df')).toBe('.pdf')
    expect(documentExtension('x.a%b$c')).toBe('.abc')
  })

  test('caps a hostile long extension at 12 characters before sanitising', () => {
    const ext = documentExtension(`doc.${'a'.repeat(500)}`)
    expect(ext.length).toBeLessThanOrEqual(12)
  })
})

describe('buildStoredName', () => {
  test('is a uuid plus the sanitised extension, never the client name', () => {
    const stored = buildStoredName('Surat Keputusan Final.PDF')
    expect(stored).not.toContain('Surat')
    expect(stored.endsWith('.PDF')).toBe(true)
    expect(stored.slice(0, 36)).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('two uploads of the same filename do not collide', () => {
    expect(buildStoredName('a.pdf')).not.toBe(buildStoredName('a.pdf'))
  })
})
