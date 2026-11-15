// Response headers of the evidence serve route (GET /api/evidence/:file) end to
// end: real Postgres, real MinIO, real disk, no mocks. Both of its body paths
// are exercised, because they used to be unsafe in two different ways:
//
//   - MinIO path: `new Response(bytes)` — no Content-Type, no disposition, no
//     nosniff, so the browser sniffed the bytes and rendered an uploaded .html.
//   - legacy disk path: `new Response(bunFile)` — Bun fills Content-Type in
//     from the extension, so a .html on disk was rendered deliberately.
//
// The route is same-origin and session-gated and uploading only needs "project
// member, not VIEWER", so either one was stored XSS against other members.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { env } from '../../src/lib/env'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let memberToken = ''
let taskId = ''
let diskTaskId = ''

/** Upload a file as evidence and fetch it back through the serve route. */
async function uploadThenServe(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await app.handle(
    new Request(`http://localhost/api/tasks/${taskId}/evidence/upload`, {
      method: 'POST',
      headers: { cookie: `session=${memberToken}` },
      body: form,
    }),
  )
  expect(res.status).toBe(200)
  const { evidence } = (await res.json()) as { evidence: { url: string } }
  const served = await app.handle(
    new Request(`http://localhost${evidence.url}`, { headers: { cookie: `session=${memberToken}` } }),
  )
  return { url: evidence.url, served }
}

/** Put a file straight on disk in the pre-MinIO layout and serve it. */
async function diskThenServe(name: string, body: string) {
  const path = await import('node:path')
  const dir = path.resolve(env.UPLOADS_DIR, 'evidence', diskTaskId)
  await Bun.write(path.join(dir, name), body)
  return app.handle(
    new Request(`http://localhost/api/evidence/${name}?task=${diskTaskId}`, {
      headers: { cookie: `session=${memberToken}` },
    }),
  )
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser('evhdr-owner@example.com', 'pass123', 'Ev Owner')
  const member = await seedTestUser('evhdr-member@example.com', 'pass123', 'Ev Member')
  memberToken = await createTestSession(member.id)

  const project = await prisma.project.create({
    data: {
      ownerId: owner.id,
      name: 'Evidence Serve Headers',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
    },
  })
  const base = {
    projectId: project.id,
    reporterId: owner.id,
    description: '',
    kind: 'TASK' as const,
    status: 'OPEN' as const,
    priority: 'MEDIUM' as const,
  }
  taskId = (await prisma.task.create({ data: { ...base, title: 'Evidence via MinIO' } })).id
  // A second task so the legacy-disk cases cannot be answered by a MinIO object
  // an earlier upload left behind under the same name.
  diskTaskId = (await prisma.task.create({ data: { ...base, title: 'Evidence on disk' } })).id
})

afterAll(async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  await fs.rm(path.resolve(env.UPLOADS_DIR, 'evidence', diskTaskId), { recursive: true, force: true })
  await cleanupTestData()
})

describe('MinIO path: allowlisted types render inline', () => {
  test('a png serves inline as image/png with nosniff', async () => {
    const { served } = await uploadThenServe(new File(['fake png bytes'], 'bukti.png', { type: 'image/png' }))
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/png')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('fake png bytes')
  })

  test('a pdf serves inline with nosniff', async () => {
    const { served } = await uploadThenServe(new File(['%PDF-1.4'], 'laporan.pdf', { type: 'application/pdf' }))
    expect(served.headers.get('Content-Type')).toBe('application/pdf')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('a txt log serves inline with a utf-8 charset', async () => {
    const { served } = await uploadThenServe(new File(['stack trace'], 'run.txt', { type: 'text/plain' }))
    expect(served.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('stack trace')
  })
})

describe('MinIO path: scriptable types are forced to download', () => {
  // The actual attack payload, through the real upload endpoint.
  test('an uploaded .html is attachment + nosniff, so it downloads instead of rendering', async () => {
    const html = '<script>fetch("/api/users")</script>'
    const { served } = await uploadThenServe(new File([html], 'payload.html', { type: 'text/html' }))
    expect(served.status).toBe(200)
    // The type is echoed (CLAUDE.md "Header serve dokumen"); attachment + nosniff
    // is the property that stops it rendering.
    expect(served.headers.get('Content-Type')).toBe('text/html')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    // Bytes still delivered intact — this is a download, not censorship.
    expect(await served.text()).toBe(html)
  })

  test('an uploaded .svg is attachment + nosniff, so it downloads instead of rendering', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    const { served } = await uploadThenServe(new File([svg], 'logo.svg', { type: 'image/svg+xml' }))
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  // The upload endpoint lets the client claim any `file.type`, but the serve
  // route never reads it — the type comes from the stored extension. A .html
  // dressed up as image/png is served as text/html (from the extension, not the
  // claim) and still downloads.
  test('a .html claiming image/png gets its type from the extension and is still an attachment', async () => {
    const { served } = await uploadThenServe(new File(['<script>1</script>'], 'liar.html', { type: 'image/png' }))
    expect(served.headers.get('Content-Type')).toBe('text/html')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('an extension-less upload falls closed to an attachment', async () => {
    const { served } = await uploadThenServe(new File(['raw'], 'dumpfile', { type: 'text/html' }))
    expect(served.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('legacy disk path sends the same headers', () => {
  // Pre-MinIO evidence still on disk. This path built its Response from a
  // BunFile, which injects Content-Type from the extension, so it needs the
  // headers set explicitly rather than being assumed safe already.
  test('a .html on disk is attachment + nosniff, so it downloads instead of rendering', async () => {
    const served = await diskThenServe('legacy.html', '<script>alert(1)</script>')
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('text/html')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('<script>alert(1)</script>')
  })

  test('a .svg on disk is attachment + nosniff, so it downloads instead of rendering', async () => {
    const served = await diskThenServe('legacy.svg', '<svg><script>alert(1)</script></svg>')
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(served.headers.get('Content-Disposition')).toStartWith('attachment;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('a .png on disk still serves inline, with nosniff', async () => {
    const served = await diskThenServe('legacy.png', 'png-ish')
    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/png')
    expect(served.headers.get('Content-Disposition')).toStartWith('inline;')
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await served.text()).toBe('png-ish')
  })
})

describe('the served filename reaches the header safely', () => {
  // safeName is stripped to [a-zA-Z0-9._-] before anything else, so a quote or
  // CRLF cannot even reach the header builder here — asserted anyway, because
  // the guarantee is "no injected header", not "the sanitiser happened to run".
  test('a quote and CRLF in the request path inject nothing', async () => {
    const served = await diskThenServe('inject.png', 'x')
    const probe = await app.handle(
      new Request(`http://localhost/api/evidence/inject%22%0D%0AX-Injected:%201.png?task=${diskTaskId}`, {
        headers: { cookie: `session=${memberToken}` },
      }),
    )
    expect(served.status).toBe(200)
    const disposition = probe.headers.get('Content-Disposition') ?? ''
    expect(disposition).not.toContain('"')
    expect(disposition).not.toContain('\r')
    expect(disposition).not.toContain('\n')
    expect(disposition).not.toContain('filename="')
    expect(probe.headers.get('X-Injected')).toBeNull()
  })

  test('a 404 carries no document headers at all', async () => {
    const served = await app.handle(
      new Request(`http://localhost/api/evidence/tidak-ada.png?task=${taskId}`, {
        headers: { cookie: `session=${memberToken}` },
      }),
    )
    expect(served.status).toBe(404)
    expect(served.headers.get('Content-Disposition')).toBeNull()
  })
})
