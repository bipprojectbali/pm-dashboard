// The inline allowlist that decides whether an uploaded document renders in the
// browser or downloads. These assertions are the security boundary, not style
// checks: a type moving from attachment to inline is a stored-XSS regression.
import { describe, expect, test } from 'bun:test'
import {
  canPreviewDocument,
  documentContentDisposition,
  documentContentType,
  documentPreviewKind,
  documentResponseHeaders,
} from '../../src/lib/document-preview'

describe('inline allowlist', () => {
  const INLINE: Array<[string, string]> = [
    ['image/png', 'image'],
    ['image/jpeg', 'image'],
    ['image/gif', 'image'],
    ['image/webp', 'image'],
    ['image/avif', 'image'],
    ['image/bmp', 'image'],
    ['application/pdf', 'pdf'],
    ['text/plain', 'text'],
  ]

  for (const [mime, kind] of INLINE) {
    test(`${mime} previews as ${kind} and serves inline`, () => {
      expect(documentPreviewKind(mime)).toBe(kind as 'image' | 'pdf' | 'text')
      expect(canPreviewDocument(mime)).toBe(true)
      expect(documentContentDisposition(mime, 'a.bin')).toStartWith('inline;')
    })
  }

  // The reason this module exists. An SVG looks like an image and HTML looks
  // like a document, and both execute script on this origin when rendered.
  const NEVER_INLINE = [
    'image/svg+xml',
    'text/html',
    'application/xhtml+xml',
    'text/xml',
    'text/csv',
    'text/javascript',
    'application/javascript',
    'application/xml',
    'text/css',
    'application/octet-stream',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  for (const mime of NEVER_INLINE) {
    test(`${mime} is never inline`, () => {
      expect(documentPreviewKind(mime)).toBeNull()
      expect(canPreviewDocument(mime)).toBe(false)
      expect(documentContentDisposition(mime, 'a.bin')).toStartWith('attachment;')
    })
  }

  test('an unknown or malformed type falls back to attachment', () => {
    for (const mime of ['', '   ', 'nonsense', 'image/', '/png', 'image/png/extra']) {
      expect(canPreviewDocument(mime)).toBe(false)
    }
  })
})

describe('mime matching is case- and parameter-insensitive', () => {
  test('uppercase still matches the allowlist', () => {
    expect(canPreviewDocument('IMAGE/PNG')).toBe(true)
    expect(documentPreviewKind('Application/PDF')).toBe('pdf')
  })

  // A bypass if it ever regressed: `TEXT/HTML` has to be refused exactly like
  // `text/html`, and `text/html; charset=utf-8` exactly like both.
  test('uppercase and parameterised html are still refused', () => {
    expect(canPreviewDocument('TEXT/HTML')).toBe(false)
    expect(canPreviewDocument('text/html; charset=utf-8')).toBe(false)
    expect(canPreviewDocument('Image/SVG+XML')).toBe(false)
  })

  test('parameters after a semicolon are ignored when matching', () => {
    expect(canPreviewDocument('text/plain; charset=utf-8')).toBe(true)
    expect(canPreviewDocument('text/plain;charset=iso-8859-1')).toBe(true)
    expect(documentPreviewKind('image/png; name=x.png')).toBe('image')
  })

  test('surrounding whitespace is tolerated', () => {
    expect(canPreviewDocument('  application/pdf  ')).toBe(true)
  })
})

describe('Content-Type', () => {
  test('text/plain keeps a constant utf-8 charset so notes do not render as mojibake', () => {
    expect(documentContentType('text/plain')).toBe('text/plain; charset=utf-8')
    expect(documentContentType('text/plain; charset=iso-8859-1')).toBe('text/plain; charset=utf-8')
  })

  test('an allowlisted type is served as its bare base type', () => {
    expect(documentContentType('IMAGE/PNG; name=x')).toBe('image/png')
    expect(documentContentType('application/pdf')).toBe('application/pdf')
  })

  test('a non-allowlisted but well-formed type is echoed, safe behind attachment + nosniff', () => {
    expect(documentContentType('text/html')).toBe('text/html')
    expect(documentContentType('image/svg+xml')).toBe('image/svg+xml')
  })

  test('a malformed type collapses to octet-stream rather than reaching a header', () => {
    expect(documentContentType('nonsense')).toBe('application/octet-stream')
    expect(documentContentType('')).toBe('application/octet-stream')
    expect(documentContentType('text/html\r\nX-Injected: 1')).toBe('application/octet-stream')
  })
})

describe('Content-Disposition filename is RFC 5987 only', () => {
  test('a plain ascii name', () => {
    expect(documentContentDisposition('application/pdf', 'surat.pdf')).toBe("inline; filename*=UTF-8''surat.pdf")
  })

  // The injection case: a quote, a CR and an LF in a client-supplied filename
  // must never survive into the header. No quoted `filename="…"` form is
  // emitted at all, and every dangerous byte is percent-encoded.
  test('a quote and CRLF are percent-encoded, not interpolated', () => {
    const header = documentContentDisposition('application/zip', 'ev"il\r\nX-Injected: 1.zip')
    expect(header).not.toContain('"')
    expect(header).not.toContain('\r')
    expect(header).not.toContain('\n')
    expect(header).not.toContain('filename="')
    expect(header).toContain('%22')
    expect(header).toContain('%0D%0A')
    expect(header).toStartWith("attachment; filename*=UTF-8''")
    // It survives as a real header value rather than throwing or splitting.
    expect(new Headers({ 'Content-Disposition': header }).get('Content-Disposition')).toBe(header)
  })

  test('a single quote is encoded too — it is not an RFC 5987 attr-char', () => {
    const header = documentContentDisposition('application/pdf', "it's.pdf")
    expect(header).toBe("inline; filename*=UTF-8''it%27s.pdf")
  })

  test('non-ascii is utf-8 percent-encoded', () => {
    expect(documentContentDisposition('application/pdf', 'Lampiran Ä£.pdf')).toBe(
      "inline; filename*=UTF-8''Lampiran%20%C3%84%C2%A3.pdf",
    )
    expect(documentContentDisposition('application/pdf', '笔记.pdf')).toBe(
      "inline; filename*=UTF-8''%E7%AC%94%E8%AE%B0.pdf",
    )
  })

  test('parentheses and asterisks are encoded as well', () => {
    const header = documentContentDisposition('application/pdf', 'draft (2)*.pdf')
    expect(header).toBe("inline; filename*=UTF-8''draft%20%282%29%2A.pdf")
  })

  test('an empty name falls back rather than emitting a bare filename*', () => {
    expect(documentContentDisposition('application/pdf', '   ')).toBe("inline; filename*=UTF-8''document")
  })
})

describe('documentResponseHeaders', () => {
  test('an allowlisted image is inline and still nosniff', () => {
    const h = documentResponseHeaders('image/png', 'bukti.png')
    expect(h['Content-Type']).toBe('image/png')
    expect(h['Content-Disposition']).toBe("inline; filename*=UTF-8''bukti.png")
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  // nosniff matters most here: without it the browser may sniff the bytes and
  // render the HTML anyway, undoing the attachment decision.
  test('html is attachment AND nosniff', () => {
    const h = documentResponseHeaders('text/html', 'payload.html')
    expect(h['Content-Disposition']).toStartWith('attachment;')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  test('svg is attachment AND nosniff', () => {
    const h = documentResponseHeaders('image/svg+xml', 'logo.svg')
    expect(h['Content-Disposition']).toStartWith('attachment;')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  test('every header value is a legal header value for any input', () => {
    const nasty = 'x"\r\n\t\u0000 (*) é.svg'
    const h = documentResponseHeaders('image/svg+xml\r\nX-Injected: 1', nasty)
    expect(() => new Headers(h)).not.toThrow()
    expect(h['Content-Type']).toBe('application/octet-stream')
  })
})
