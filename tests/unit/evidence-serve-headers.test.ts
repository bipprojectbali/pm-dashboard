// `evidenceResponseHeaders` — the extension-to-headers step that the evidence
// serve route (GET /api/evidence/:file) relies on. `TaskEvidence` has no
// mimeType column, so the stored filename IS the whole input; these assertions
// are the security boundary, not style checks.
//
// The regression they guard: the route used to answer `new Response(bytes)` on
// the MinIO path and `new Response(bunFile)` on the legacy disk path — no type
// and no nosniff on one, an extension-derived `text/html` on the other. Either
// way a .html uploaded by any non-VIEWER project member rendered on this
// same-origin, session-gated route.
import { describe, expect, test } from 'bun:test'
import { evidenceResponseHeaders } from '../../src/lib/evidence-storage'

describe('allowlisted extensions serve inline', () => {
  const INLINE: Array<[string, string]> = [
    ['e1.png', 'image/png'],
    ['e2.jpg', 'image/jpeg'],
    ['e3.jpeg', 'image/jpeg'],
    ['e4.gif', 'image/gif'],
    ['e5.webp', 'image/webp'],
    ['e6.avif', 'image/avif'],
    ['e7.pdf', 'application/pdf'],
  ]

  for (const [name, contentType] of INLINE) {
    test(`${name} is inline ${contentType} with nosniff`, () => {
      const headers = evidenceResponseHeaders(name)
      expect(headers['Content-Type']).toBe(contentType)
      expect(headers['Content-Disposition']).toStartWith('inline;')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    })
  }

  test('.txt keeps a constant utf-8 charset so a log is not mojibake', () => {
    const headers = evidenceResponseHeaders('run.txt')
    expect(headers['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(headers['Content-Disposition']).toStartWith('inline;')
  })
})

describe('scriptable extensions are forced to download', () => {
  // The attack payloads. Bun maps these extensions to real scriptable types,
  // and the allowlist then refuses every one of them.
  const NEVER_INLINE = [
    'payload.html',
    'payload.htm',
    'payload.xhtml',
    'logo.svg',
    'sheet.xml',
    'exploit.js',
    'data.json',
    'page.css',
    // Mapped by the platform but off the allowlist: the type is echoed, and it
    // is the attachment + nosniff pair that makes echoing it safe.
    'archive.zip',
  ]

  for (const name of NEVER_INLINE) {
    test(`${name} is an attachment with nosniff`, () => {
      const headers = evidenceResponseHeaders(name)
      expect(headers['Content-Disposition']).toStartWith('attachment;')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    })
  }
})

describe('unknown extensions fail closed', () => {
  // The whole point of deriving from the extension rather than trusting a
  // stored string: anything the platform cannot map becomes
  // application/octet-stream, which is not on the allowlist, which is an
  // attachment. A new scriptable extension nobody thought of lands here too.
  const UNKNOWN = ['legacy', 'weird.xyzzy', 'trailing.', '']

  for (const name of UNKNOWN) {
    test(`${JSON.stringify(name)} is an attachment with nosniff`, () => {
      const headers = evidenceResponseHeaders(name)
      expect(headers['Content-Type']).toBe('application/octet-stream')
      expect(headers['Content-Disposition']).toStartWith('attachment;')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    })
  }

  // .bmp is on the document allowlist, but Bun maps the extension to the
  // legacy `image/x-ms-bmp` alias, which is not. Pinned because the direction
  // of that mismatch is the safe one: stricter than the document route, never
  // looser. If it ever flips to `image/bmp` this test says so out loud.
  test('.bmp lands on the strict side of the extension mapping', () => {
    const headers = evidenceResponseHeaders('old.bmp')
    expect(headers['Content-Disposition']).toStartWith('attachment;')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })
})

describe('the filename cannot inject a header', () => {
  // safeName is already stripped to [a-zA-Z0-9._-] by the route, so this is
  // belt and braces — but the defence must not depend on that stripping having
  // happened, which is why the quoted `filename="…"` form is never emitted.
  test('a quote and CRLF survive only as percent-encoding', () => {
    const disposition = evidenceResponseHeaders('ev"il\r\nX-Injected: 1.html')['Content-Disposition'] ?? ''
    expect(disposition).toStartWith("attachment; filename*=UTF-8''")
    expect(disposition).not.toContain('"')
    expect(disposition).not.toContain('\r')
    expect(disposition).not.toContain('\n')
    expect(disposition).not.toContain('filename="')
  })

  test('an uppercase extension is matched case-insensitively', () => {
    expect(evidenceResponseHeaders('PAYLOAD.HTML')['Content-Disposition']).toStartWith('attachment;')
    expect(evidenceResponseHeaders('SHOT.PNG')['Content-Type']).toBe('image/png')
  })
})
