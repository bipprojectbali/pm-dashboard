/**
 * Which uploaded documents a browser may render inline, and the exact response
 * headers the serve route sends.
 *
 * PURE ON PURPOSE: this module imports nothing — no prisma, no env, no storage
 * client — because the Vite-bundled frontend imports it too. One allowlist with
 * two consumers; a second copy on the frontend would drift, and the copy that
 * drifts is the one that decides whether a `.html` upload renders.
 *
 * Why an allowlist and not a blocklist: the bucket is private but the serve
 * route is same-origin, so anything the browser renders there runs with the
 * viewer's session. A blocklist is a bet that we enumerated every scriptable
 * type; an allowlist fails closed on the type nobody thought of.
 */

/** What the preview UI should mount for a document, or `null` if it may not be previewed at all. */
export type DocumentPreviewKind = 'image' | 'pdf' | 'text'

/**
 * The ONLY types that may be served inline, each mapped to the viewer that can
 * render it. Presence in this map is the inline decision; absence is an
 * attachment. Keys are lowercase base types with no parameters.
 *
 * Deliberately absent, and they must stay absent:
 * - `image/svg+xml` — an SVG is an XML document that may carry <script>, and it
 *   renders as a document, not as a picture. It looks like an image in every
 *   file listing, which is exactly what makes it the easy mistake to make.
 * - `text/html`, `application/xhtml+xml` — the plain stored-XSS vector.
 * - every other `text/*` — `text/xml` carries XSLT, and future `text/` subtypes
 *   are unknown by definition. Only `text/plain` is listed, one entry at a time.
 *
 * Anyone adding a type here is deciding it can never execute script on this
 * origin. If that is not provably true, it belongs in the attachment path.
 */
const INLINE_KINDS: Record<string, DocumentPreviewKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/bmp': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
}

/** A conservative media-type token. Anything else is treated as unknown, never echoed into a header. */
const MIME_TOKEN = /^[\w.+-]+\/[\w.+-]+$/

/**
 * Lowercase, trim, and drop any `; charset=…` parameters. `mimeType` is stored
 * straight from the upload, so `TEXT/HTML` and `text/html; charset=utf-8` have
 * to match the allowlist the same way `text/html` does — a comparison that
 * missed either would be a bypass, not a cosmetic miss.
 */
function baseType(mimeType: string): string {
  return (mimeType.split(';')[0] ?? '').trim().toLowerCase()
}

/** The viewer for this type, or `null` when it may not be rendered inline. */
export function documentPreviewKind(mimeType: string): DocumentPreviewKind | null {
  return INLINE_KINDS[baseType(mimeType)] ?? null
}

/** True when the type is on the inline allowlist — the same answer the serve route acts on. */
export function canPreviewDocument(mimeType: string): boolean {
  return documentPreviewKind(mimeType) !== null
}

/**
 * RFC 5987 `ext-value` encoding. `encodeURIComponent` already escapes CR, LF
 * and `"` — the header-injection characters — but leaves `'()*`, which are not
 * `attr-char` and would confuse a parser reading the `UTF-8''…` form. Escaping
 * them costs one line and removes the question.
 */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * The `Content-Disposition` for a document.
 *
 * `originalName` is client-controlled, so it is NEVER interpolated into a
 * quoted `filename="…"`: a CR, LF or `"` in an uploaded filename would end the
 * header and inject the next one. The RFC 5987 `filename*` form is the whole
 * filename story here — every browser that matters has understood it for a
 * decade, so there is nothing to gain from carrying the dangerous form as a
 * fallback.
 */
export function documentContentDisposition(mimeType: string, originalName: string): string {
  const type = canPreviewDocument(mimeType) ? 'inline' : 'attachment'
  const name = originalName.trim() || 'document'
  return `${type}; filename*=UTF-8''${rfc5987(name)}`
}

/**
 * The `Content-Type` to serve. Non-allowlisted types collapse to
 * `application/octet-stream`: combined with the `attachment` disposition the
 * browser downloads rather than renders, and no client-controlled text reaches
 * the header at all. `charset` is re-attached for `text/plain` only, as a
 * constant, so a UTF-8 note does not render as mojibake.
 */
export function documentContentType(mimeType: string): string {
  const base = baseType(mimeType)
  if (base === 'text/plain') return 'text/plain; charset=utf-8'
  if (canPreviewDocument(base)) return base
  // Echoing a non-allowlisted type is safe behind `attachment` + `nosniff`, and
  // keeps the downloaded file associated with the right app — but only once the
  // token check has proved it holds no header-breaking characters.
  return MIME_TOKEN.test(base) ? base : 'application/octet-stream'
}

/**
 * Every header the serve route sends for a document body.
 *
 * `nosniff` goes on inline AND attachment responses alike: without it a browser
 * may ignore the declared type and sniff the bytes, which would hand back the
 * exact rendering decision the allowlist just made.
 */
export function documentResponseHeaders(mimeType: string, originalName: string): Record<string, string> {
  return {
    'Content-Type': documentContentType(mimeType),
    'Content-Disposition': documentContentDisposition(mimeType, originalName),
    'X-Content-Type-Options': 'nosniff',
  }
}
