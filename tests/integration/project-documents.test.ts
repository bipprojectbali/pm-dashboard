// Project-level documents (dokumentasi/artefak/surat-surat). Hits the real
// Postgres and the real MinIO bucket the test env points at — nothing is
// mocked, because the whole point of the serve route is that the bytes really
// came back out of storage.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { env } from '../../src/lib/env'
import { withLockBypass } from '../../src/lib/prisma-project-lock'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

const EMAILS = [
  'doc-owner@example.com',
  'doc-member@example.com',
  'doc-member2@example.com',
  'doc-viewer@example.com',
  'doc-outsider@example.com',
]

let ownerToken = ''
let memberToken = ''
let member2Token = ''
let viewerToken = ''
let outsiderToken = ''
let memberId = ''
let actorIds: string[] = []
let projectId = ''
let lockedProjectId = ''
let previousGrace: string | null = null

function upload(session: string, project: string, file: File, fields: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return app.handle(
    new Request(`http://localhost/api/projects/${project}/documents/upload`, {
      method: 'POST',
      headers: { cookie: `session=${session}` },
      body: form,
    }),
  )
}

function req(session: string | null, method: string, path: string) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: session ? { cookie: `session=${session}` } : {},
    }),
  )
}

function pdf(name: string, body = 'surat tugas nomor 1') {
  return new File([body], name, { type: 'application/pdf' })
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser(EMAILS[0] as string, 'pass123', 'Doc Owner')
  const member = await seedTestUser(EMAILS[1] as string, 'pass123', 'Doc Member')
  const member2 = await seedTestUser(EMAILS[2] as string, 'pass123', 'Doc Member Two')
  const viewer = await seedTestUser(EMAILS[3] as string, 'pass123', 'Doc Viewer')
  const outsider = await seedTestUser(EMAILS[4] as string, 'pass123', 'Doc Outsider')
  memberId = member.id
  actorIds = [owner.id, member.id, member2.id]
  ownerToken = await createTestSession(owner.id)
  memberToken = await createTestSession(member.id)
  member2Token = await createTestSession(member2.id)
  viewerToken = await createTestSession(viewer.id)
  outsiderToken = await createTestSession(outsider.id)

  const now = Date.now()
  const base = {
    ownerId: owner.id,
    status: 'ACTIVE' as const,
    priority: 'MEDIUM' as const,
    visibility: 'PRIVATE' as const,
  }
  const members = {
    create: [
      { userId: owner.id, role: 'OWNER' as const },
      { userId: member.id, role: 'MEMBER' as const },
      { userId: member2.id, role: 'MEMBER' as const },
      { userId: viewer.id, role: 'VIEWER' as const },
    ],
  }
  const healthy = await prisma.project.create({
    data: { ...base, name: 'Doc Healthy', endsAt: new Date(now + 30 * DAY_MS), members },
  })
  projectId = healthy.id
  // Seeded with a future deadline, then moved into the past: creating members on
  // an already-locked project would itself be refused by the write guard.
  const locked = await prisma.project.create({
    data: { ...base, name: 'Doc Locked', endsAt: new Date(now + DAY_MS), members },
  })
  lockedProjectId = locked.id

  previousGrace = (await prisma.appSetting.findUnique({ where: { key: LOCK_GRACE_SETTING_KEY } }))?.value ?? null
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: '7' },
    create: { key: LOCK_GRACE_SETTING_KEY, value: '7' },
  })
  invalidateProjectLockCache()
  await prisma.project.update({ where: { id: lockedProjectId }, data: { endsAt: new Date(now - 30 * DAY_MS) } })
})

afterAll(async () => {
  if (previousGrace === null) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  } else {
    await prisma.appSetting.update({ where: { key: LOCK_GRACE_SETTING_KEY }, data: { value: previousGrace } })
  }
  invalidateProjectLockCache()
  await withLockBypass(() => prisma.projectDocument.deleteMany({ where: { projectId: { in: [projectId, lockedProjectId] } } }))
  await cleanupTestData()
})

describe('upload', () => {
  let docId = ''

  test('golden path: row carries every traceability field and the bytes come back', async () => {
    const res = await upload(memberToken, projectId, pdf('Surat Tugas.pdf'), { note: 'arsip triwulan' })
    expect(res.status).toBe(200)
    const { document } = (await res.json()) as { document: Record<string, unknown> }
    docId = document.id as string

    expect(document.title).toBe('Surat Tugas.pdf')
    expect(document.originalName).toBe('Surat Tugas.pdf')
    expect(document.mimeType).toBe('application/pdf')
    expect(document.sizeBytes).toBe('surat tugas nomor 1'.length)
    expect(document.note).toBe('arsip triwulan')
    expect(document.projectId).toBe(projectId)
    expect(document.uploadedBy).toEqual({ id: memberId, name: 'Doc Member' })
    expect(document.url).toBe(`/api/projects/${projectId}/documents/${docId}/file`)

    // The stored name is never the client filename.
    const row = await prisma.projectDocument.findUniqueOrThrow({
      where: { id: docId },
      select: { storedName: true, uploadedById: true },
    })
    expect(row.storedName).not.toContain('Surat')
    expect(row.storedName.endsWith('.pdf')).toBe(true)
    expect(row.uploadedById).toBe(memberId)

    const file = await req(memberToken, 'GET', `/api/projects/${projectId}/documents/${docId}/file`)
    expect(file.status).toBe(200)
    expect(file.headers.get('Content-Type')).toContain('application/pdf')
    expect(await file.text()).toBe('surat tugas nomor 1')
  })

  test('title defaults to the original filename when omitted', async () => {
    const res = await upload(ownerToken, projectId, pdf('Berita Acara.pdf'))
    expect(res.status).toBe(200)
    const { document } = (await res.json()) as { document: { title: string; note: string | null } }
    expect(document.title).toBe('Berita Acara.pdf')
    expect(document.note).toBeNull()
  })

  test('list returns the uploads, newest first', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${projectId}/documents`)
    expect(res.status).toBe(200)
    const { documents } = (await res.json()) as { documents: Array<{ id: string; createdAt: string; title: string }> }
    expect(documents.length).toBeGreaterThanOrEqual(2)
    expect(documents.some((d) => d.id === docId)).toBe(true)
    expect(documents.map((d) => d.title)).toContain('Berita Acara.pdf')
    // Ordering asserted as the invariant, not as a fixed first element: two
    // uploads can share a millisecond and TIMESTAMP(3) cannot tell them apart.
    const stamps = documents.map((d) => Date.parse(d.createdAt))
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps)
  })

  test('empty file is 400', async () => {
    const res = await upload(memberToken, projectId, new File([], 'kosong.pdf', { type: 'application/pdf' }))
    expect(res.status).toBe(400)
  })

  test('missing file field is 400', async () => {
    const form = new FormData()
    form.append('title', 'tanpa file')
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/documents/upload`, {
        method: 'POST',
        headers: { cookie: `session=${memberToken}` },
        body: form,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('oversized file is 413 and no row is written', async () => {
    const before = await prisma.projectDocument.count({ where: { projectId } })
    const big = new File([new Uint8Array(env.UPLOAD_MAX_BYTES + 1)], 'besar.bin', {
      type: 'application/octet-stream',
    })
    const res = await upload(memberToken, projectId, big)
    expect(res.status).toBe(413)
    expect(await prisma.projectDocument.count({ where: { projectId } })).toBe(before)
  })
})

describe('authorization', () => {
  test('VIEWER member cannot upload', async () => {
    const res = await upload(viewerToken, projectId, pdf('viewer.pdf'))
    expect(res.status).toBe(403)
  })

  test('VIEWER member can still list', async () => {
    const res = await req(viewerToken, 'GET', `/api/projects/${projectId}/documents`)
    expect(res.status).toBe(200)
  })

  test('non-member cannot list', async () => {
    const res = await req(outsiderToken, 'GET', `/api/projects/${projectId}/documents`)
    expect(res.status).toBe(403)
  })

  test('unauthenticated request is 401', async () => {
    const res = await req(null, 'GET', `/api/projects/${projectId}/documents`)
    expect(res.status).toBe(401)
  })

  test('unknown project is 404', async () => {
    const res = await req(memberToken, 'GET', '/api/projects/does-not-exist/documents')
    expect(res.status).toBe(404)
  })

  test('unknown document id is 404', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${projectId}/documents/does-not-exist/file`)
    expect(res.status).toBe(404)
  })
})

describe('overdue lock', () => {
  test('upload to a locked project is refused 403 with { locked: true }', async () => {
    const res = await upload(memberToken, lockedProjectId, pdf('saat-terkunci.pdf'))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { locked?: boolean; projectId?: string }
    expect(body.locked).toBe(true)
    expect(body.projectId).toBe(lockedProjectId)
    expect(await prisma.projectDocument.count({ where: { projectId: lockedProjectId } })).toBe(0)
  })

  test('listing a locked project is refused for members too', async () => {
    const res = await req(ownerToken, 'GET', `/api/projects/${lockedProjectId}/documents`)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { locked?: boolean }
    expect(body.locked).toBe(true)
  })

  test('the data layer refuses the write even without a route gate', async () => {
    // Proves projectDocument is in GUARDED_MODELS: a direct prisma write — the
    // shape a future route/cron/MCP tool would use — is refused on its own.
    const call = async () =>
      prisma.projectDocument.create({
        data: {
          projectId: lockedProjectId,
          title: 'langsung ke prisma',
          storedName: 'x.pdf',
          originalName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          uploadedById: memberId,
        },
      })
    await expect(call()).rejects.toThrow(/terkunci/)
  })
})

describe('delete', () => {
  async function seedDoc(session: string, name: string) {
    const res = await upload(session, projectId, pdf(name))
    const { document } = (await res.json()) as { document: { id: string } }
    return document.id
  }

  test('a different plain MEMBER cannot delete someone else’s document', async () => {
    const id = await seedDoc(memberToken, 'milik-member.pdf')
    const res = await req(member2Token, 'DELETE', `/api/projects/${projectId}/documents/${id}`)
    expect(res.status).toBe(403)
    expect(await prisma.projectDocument.count({ where: { id } })).toBe(1)
  })

  test('the uploader can delete their own document; the row is trashed, not gone', async () => {
    const id = await seedDoc(memberToken, 'hapus-sendiri.pdf')
    const res = await req(memberToken, 'DELETE', `/api/projects/${projectId}/documents/${id}`)
    expect(res.status).toBe(200)
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
    const row = await prisma.projectDocument.findUnique({ where: { id }, select: { deletedAt: true } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
    const file = await req(memberToken, 'GET', `/api/projects/${projectId}/documents/${id}/file`)
    expect(file.status).toBe(404)
  })

  test('OWNER can delete a document uploaded by someone else', async () => {
    const id = await seedDoc(memberToken, 'dihapus-owner.pdf')
    const res = await req(ownerToken, 'DELETE', `/api/projects/${projectId}/documents/${id}`)
    expect(res.status).toBe(200)
    const row = await prisma.projectDocument.findUnique({ where: { id }, select: { deletedAt: true } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  test('audit trail records upload and delete by id, with no email in the detail', async () => {
    // writeAuditLog is fire-and-forget, so poll instead of racing it. Scoped to
    // this run's user ids, so a leftover row from an earlier run cannot pass it.
    const where = {
      userId: { in: actorIds },
      action: { in: ['PROJECT_DOCUMENT_UPLOADED', 'PROJECT_DOCUMENT_DELETED'] },
    }
    let logs: Array<{ action: string; detail: string | null; userId: string | null }> = []
    for (let i = 0; i < 20; i++) {
      logs = await prisma.auditLog.findMany({ where, select: { action: true, detail: true, userId: true } })
      if (logs.some((l) => l.action === 'PROJECT_DOCUMENT_DELETED')) break
      await Bun.sleep(100)
    }
    expect(logs.some((l) => l.action === 'PROJECT_DOCUMENT_UPLOADED')).toBe(true)
    expect(logs.some((l) => l.action === 'PROJECT_DOCUMENT_DELETED')).toBe(true)
    for (const l of logs) {
      expect(l.detail).toContain(`project=${projectId}`)
      expect(l.detail ?? '').not.toContain('@')
    }
  })
})
