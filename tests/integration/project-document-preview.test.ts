// Response headers of the document serve route, end to end: real Postgres,
// real MinIO, no mocks. Its own file rather than more cases in
// project-documents.test.ts, which is already 325 lines against a 400 cap.
//
// The regression these guard: the route used to send the stored mimeType as
// Content-Type with no disposition and no nosniff, so a .html upload rendered
// on this origin with the viewer's session — stored XSS.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { withLockBypass } from '../../src/lib/prisma-project-lock'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

const EMAILS = ['docprev-owner@example.com', 'docprev-member@example.com']

let ownerToken = ''
let memberToken = ''
let projectId = ''

function upload(session: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return app.handle(
    new Request(`http://localhost/api/projects/${projectId}/documents/upload`, {
      method: 'POST',
      headers: { cookie: `session=${session}` },
      body: form,
    }),
  )
}

/** Upload a file and return the serve-route response for it. */
async function uploadThenServe(file: File) {
  const res = await upload(memberToken, file)
  expect(res.status).toBe(200)
  const { document } = (await res.json()) as { document: { id: string } }
  const served = await app.handle(
    new Request(`http://localhost/api/projects/${projectId}/documents/${document.id}/file`, {
      headers: { cookie: `session=${memberToken}` },
    }),
  )
  return { id: document.id, served }
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser(EMAILS[0] as string, 'pass123', 'Prev Owner')
  const member = await seedTestUser(EMAILS[1] as string, 'pass123', 'Prev Member')
  ownerToken = await createTestSession(owner.id)
  memberToken = await createTestSession(member.id)

  const project = await prisma.project.create({
    data: {
      ownerId: owner.id,
      name: 'Doc Preview Headers',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      endsAt: new Date(Date.now() + 30 * DAY_MS),
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await withLockBypass(() => prisma.projectDocument.deleteMany({ where: { projectId } }))
  await cleanupTestData()
})

describe('allowlisted types render inline', () => {
  test('a png serves inline, as image/png, with nosniff', async () => {
    const { served } = await uploadThenServe(new File(['fake png bytes'], 'bukti.png', { type: 'image/png' }))
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/png')
    expect(served.headers.get('Content-Disposition')).toBe("inline; filename*=UTF-8''bukti.png")
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('fake png bytes')
  })

  test('a pdf serves inline with nosniff', async () => {
    const { served } = await uploadThenServe(new File(['%PDF-1.4'], 'surat.pdf', { type: 'application/pdf' }))
    expect(served.headers.get('Content-Type')).toBe('application/pdf')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('text/plain serves inline with a utf-8 charset', async () => {
    const { served } = await uploadThenServe(new File(['catatan rapat'], 'notulen.txt', { type: 'text/plain' }))
    expect(served.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('catatan rapat')
  })
})

describe('scriptable types are forced to download', () => {
  // The actual attack payload. It must come back as an attachment so the
  // browser never executes it on this origin.
  test('an uploaded .html is attachment + nosniff, not rendered', async () => {
    const html = '<script>fetch("/api/users")</script>'
    const { served } = await uploadThenServe(new File([html], 'payload.html', { type: 'text/html' }))
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    // The bytes are still delivered intact — this is a download, not censorship.
    expect(await served.text()).toBe(html)
  })

  test('an uploaded .svg is attachment + nosniff', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    const { served } = await uploadThenServe(new File([svg], 'logo.svg', { type: 'image/svg+xml' }))
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('an unknown binary type is attachment + nosniff', async () => {
    const { served } = await uploadThenServe(
      new File(['PK'], 'arsip.zip', { type: 'application/zip' }),
    )
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('client-controlled filename reaches the header safely', () => {
  // originalName is whatever the uploader's client sent. A quote or CRLF in it
  // must not be able to terminate the header and inject another.
  //
  // Note what this layer can and cannot show: the multipart encoder already
  // percent-escapes the filename on the way in, so the stored originalName here
  // is `ev%22il%0D%0A…` rather than raw bytes, and the route escapes that again.
  // The raw-quote / raw-CRLF input is covered in tests/unit/document-preview.ts
  // — the defence must not depend on the transport having escaped first, which
  // is exactly why the route never emits a quoted `filename="…"` at all.
  test('a quote and CRLF in the filename cannot inject a header', async () => {
    const nasty = 'ev"il\r\nX-Injected: 1.html'
    const { served } = await uploadThenServe(new File(['x'], nasty, { type: 'text/html' }))
    const disposition = served.headers.get('Content-Disposition') ?? ''
    expect(disposition).toStartWith("attachment; filename*=UTF-8''")
    expect(disposition).not.toContain('"')
    expect(disposition).not.toContain('\r')
    expect(disposition).not.toContain('\n')
    expect(disposition).not.toContain('filename="')
    expect(served.headers.get('X-Injected')).toBeNull()
  })

  test('a non-ascii filename survives as utf-8 percent-encoding', async () => {
    const { served } = await uploadThenServe(new File(['x'], 'Lampiran Café.pdf', { type: 'application/pdf' }))
    expect(served.headers.get('Content-Disposition')).toBe(
      "inline; filename*=UTF-8''Lampiran%20Caf%C3%A9.pdf",
    )
  })
})

describe('trashed documents stay unreachable', () => {
  // The preview UI hides its control for trashed rows; this is the server side
  // of that same statement, so the hiding is defence in depth and not the rule.
  test('a trashed document 404s with no document headers', async () => {
    const { id, served } = await uploadThenServe(new File(['x'], 'nanti-dihapus.png', { type: 'image/png' }))
    expect(served.status).toBe(200)

    const del = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/documents/${id}`, {
        method: 'DELETE',
        headers: { cookie: `session=${ownerToken}` },
      }),
    )
    expect(del.status).toBe(200)

    const after = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/documents/${id}/file`, {
        headers: { cookie: `session=${memberToken}` },
      }),
    )
    expect(after.status).toBe(404)
    expect(after.headers.get('Content-Disposition')).toBeNull()
  })
})
