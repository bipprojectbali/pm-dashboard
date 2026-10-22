// Project document trash: soft-delete, restore, and the 30-day retention
// window. Hits the real Postgres and the real MinIO bucket — the whole point of
// the soft delete is that the bytes survive it, and only a real round-trip
// through storage can prove that.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { getDocument } from '../../src/lib/document-storage'
import { withLockBypass } from '../../src/lib/prisma-project-lock'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000
const BODY = 'surat perjanjian nomor 7'

const EMAILS = [
  'doctrash-owner@example.com',
  'doctrash-member@example.com',
  'doctrash-member2@example.com',
  'doctrash-viewer@example.com',
  'doctrash-outsider@example.com',
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

function req(session: string | null, method: string, path: string) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: session ? { cookie: `session=${session}` } : {},
    }),
  )
}

async function seedDoc(session: string, name: string) {
  const form = new FormData()
  form.append('file', new File([BODY], name, { type: 'application/pdf' }))
  const res = await app.handle(
    new Request(`http://localhost/api/projects/${projectId}/documents/upload`, {
      method: 'POST',
      headers: { cookie: `session=${session}` },
      body: form,
    }),
  )
  if (res.status !== 200) throw new Error(`seedDoc gagal: ${res.status}`)
  const { document } = (await res.json()) as { document: { id: string } }
  return document.id
}

async function trash(session: string, docId: string) {
  const res = await req(session, 'DELETE', `/api/projects/${projectId}/documents/${docId}`)
  if (res.status !== 200) throw new Error(`trash gagal: ${res.status}`)
}

function listLive(session: string) {
  return req(session, 'GET', `/api/projects/${projectId}/documents`)
}

function listTrash(session: string | null, project = projectId) {
  return req(session, 'GET', `/api/projects/${project}/documents/trash`)
}

function restore(session: string, docId: string, project = projectId) {
  return req(session, 'POST', `/api/projects/${project}/documents/${docId}/restore`)
}

async function ids(res: Response) {
  const { documents } = (await res.json()) as { documents: Array<{ id: string }> }
  return documents.map((d) => d.id)
}

beforeAll(async () => {
  await cleanupTestData()
  const owner = await seedTestUser(EMAILS[0] as string, 'pass123', 'Trash Owner')
  const member = await seedTestUser(EMAILS[1] as string, 'pass123', 'Trash Member')
  const member2 = await seedTestUser(EMAILS[2] as string, 'pass123', 'Trash Member Two')
  const viewer = await seedTestUser(EMAILS[3] as string, 'pass123', 'Trash Viewer')
  const outsider = await seedTestUser(EMAILS[4] as string, 'pass123', 'Trash Outsider')
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
    data: { ...base, name: 'Trash Healthy', endsAt: new Date(now + 30 * DAY_MS), members },
  })
  projectId = healthy.id
  // Future deadline first, then moved into the past: members cannot be created
  // on an already-locked project, the write guard refuses it.
  const locked = await prisma.project.create({
    data: { ...base, name: 'Trash Locked', endsAt: new Date(now + DAY_MS), members },
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
  await withLockBypass(() =>
    prisma.projectDocument.deleteMany({ where: { projectId: { in: [projectId, lockedProjectId] } } }),
  )
  await cleanupTestData()
})

describe('soft delete', () => {
  test('the row survives, the download 404s, and the object is still in storage', async () => {
    const id = await seedDoc(memberToken, 'dibuang.pdf')
    await trash(memberToken, id)

    const row = await prisma.projectDocument.findUnique({
      where: { id },
      select: { deletedAt: true, storedName: true },
    })
    expect(row?.deletedAt).toBeInstanceOf(Date)

    const file = await req(memberToken, 'GET', `/api/projects/${projectId}/documents/${id}/file`)
    expect(file.status).toBe(404)

    // Asserted through the real storage layer, not inferred from the 404: a
    // restore is only worth anything if the bytes outlived the delete.
    const bytes = await getDocument(projectId, row?.storedName as string).bytes()
    expect(new TextDecoder().decode(bytes)).toBe(BODY)
  })

  test('deleting an already-trashed document is 404, not a second delete', async () => {
    const id = await seedDoc(memberToken, 'dua-kali.pdf')
    await trash(memberToken, id)
    const res = await req(memberToken, 'DELETE', `/api/projects/${projectId}/documents/${id}`)
    expect(res.status).toBe(404)
  })
})

describe('listing split', () => {
  test('a trashed document leaves the live list and appears in the trash list', async () => {
    const live = await seedDoc(memberToken, 'tetap-hidup.pdf')
    const gone = await seedDoc(memberToken, 'masuk-sampah.pdf')
    await trash(memberToken, gone)

    const liveIds = await ids(await listLive(memberToken))
    expect(liveIds).toContain(live)
    expect(liveIds).not.toContain(gone)

    const trashIds = await ids(await listTrash(memberToken))
    expect(trashIds).toContain(gone)
    expect(trashIds).not.toContain(live)
  })

  test('the trash list is newest-deleted first', async () => {
    const a = await seedDoc(memberToken, 'urutan-a.pdf')
    await trash(memberToken, a)
    await Bun.sleep(5)
    const b = await seedDoc(memberToken, 'urutan-b.pdf')
    await trash(memberToken, b)

    const { documents } = (await (await listTrash(memberToken)).json()) as {
      documents: Array<{ deletedAt: string | null }>
    }
    const stamps = documents.map((d) => Date.parse(d.deletedAt as string))
    expect([...stamps].sort((x, y) => y - x)).toEqual(stamps)
  })

  test('a VIEWER may read the trash, a non-member may not', async () => {
    expect((await listTrash(viewerToken)).status).toBe(200)
    expect((await listTrash(outsiderToken)).status).toBe(403)
    expect((await listTrash(null)).status).toBe(401)
  })

  test('unknown project is 404', async () => {
    const res = await req(memberToken, 'GET', '/api/projects/does-not-exist/documents/trash')
    expect(res.status).toBe(404)
  })
})

describe('restore', () => {
  test('the uploader gets their document back, download included', async () => {
    const id = await seedDoc(memberToken, 'pulih.pdf')
    await trash(memberToken, id)

    const res = await restore(memberToken, id)
    expect(res.status).toBe(200)
    const { document } = (await res.json()) as { document: { id: string; deletedAt: string | null } }
    expect(document.id).toBe(id)
    expect(document.deletedAt).toBeNull()

    expect(await ids(await listLive(memberToken))).toContain(id)
    expect(await ids(await listTrash(memberToken))).not.toContain(id)

    const file = await req(memberToken, 'GET', `/api/projects/${projectId}/documents/${id}/file`)
    expect(file.status).toBe(200)
    expect(await file.text()).toBe(BODY)
  })

  test('OWNER may restore a document someone else uploaded', async () => {
    const id = await seedDoc(memberToken, 'pulih-owner.pdf')
    await trash(memberToken, id)
    expect((await restore(ownerToken, id)).status).toBe(200)
  })

  test('a plain MEMBER who is neither uploader nor OWNER/PM gets 403', async () => {
    const id = await seedDoc(memberToken, 'bukan-milikku.pdf')
    await trash(memberToken, id)

    const res = await restore(member2Token, id)
    expect(res.status).toBe(403)
    const row = await prisma.projectDocument.findUnique({ where: { id }, select: { deletedAt: true } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  test('a VIEWER gets 403 even though they can see the trash', async () => {
    const id = await seedDoc(memberToken, 'viewer-coba.pdf')
    await trash(memberToken, id)
    expect((await restore(viewerToken, id)).status).toBe(403)
  })

  test('restoring a document that is not in the trash is 400', async () => {
    const id = await seedDoc(memberToken, 'masih-hidup.pdf')
    const res = await restore(memberToken, id)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('tempat sampah')
  })

  test('restoring an unknown document id is 404', async () => {
    expect((await restore(ownerToken, 'does-not-exist')).status).toBe(404)
  })
})

describe('overdue lock', () => {
  test('the trash list of a locked project is refused for members, OWNER included', async () => {
    const res = await listTrash(ownerToken, lockedProjectId)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
  })

  test('a restore cannot be used to thaw a locked project', async () => {
    // Seeded while the project was still healthy is impossible here (it was
    // locked in beforeAll), so the row goes in under a bypass — the point under
    // test is the route refusing, not how the row got there.
    const doc = await withLockBypass(() =>
      prisma.projectDocument.create({
        data: {
          projectId: lockedProjectId,
          title: 'terkunci.pdf',
          storedName: 'terkunci.pdf',
          originalName: 'terkunci.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          uploadedById: memberId,
          deletedAt: new Date(),
        },
        select: { id: true },
      }),
    )
    const res = await restore(memberToken, doc.id, lockedProjectId)
    expect(res.status).toBe(403)
    const row = await prisma.projectDocument.findUnique({ where: { id: doc.id }, select: { deletedAt: true } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  test('the data layer refuses the restore write even without a route gate', async () => {
    const doc = await withLockBypass(() =>
      prisma.projectDocument.create({
        data: {
          projectId: lockedProjectId,
          title: 'langsung.pdf',
          storedName: 'langsung.pdf',
          originalName: 'langsung.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          uploadedById: memberId,
          deletedAt: new Date(),
        },
        select: { id: true },
      }),
    )
    const call = async () => prisma.projectDocument.update({ where: { id: doc.id }, data: { deletedAt: null } })
    await expect(call()).rejects.toThrow(/terkunci/)
  })
})

describe('audit trail', () => {
  test('restore is recorded by id, with no email in the detail', async () => {
    const id = await seedDoc(memberToken, 'jejak.pdf')
    await trash(memberToken, id)
    expect((await restore(memberToken, id)).status).toBe(200)

    // writeAuditLog is fire-and-forget, so poll instead of racing it.
    const where = { userId: { in: actorIds }, action: 'PROJECT_DOCUMENT_RESTORED' }
    let logs: Array<{ detail: string | null }> = []
    for (let i = 0; i < 20; i++) {
      logs = await prisma.auditLog.findMany({ where, select: { detail: true } })
      if (logs.some((l) => l.detail?.includes(`document=${id}`))) break
      await Bun.sleep(100)
    }
    const mine = logs.find((l) => l.detail?.includes(`document=${id}`))
    expect(mine).toBeDefined()
    expect(mine?.detail).toContain(`project=${projectId}`)
    expect(mine?.detail).toContain(`uploader=${memberId}`)
    expect(mine?.detail ?? '').not.toContain('@')
  })
})
