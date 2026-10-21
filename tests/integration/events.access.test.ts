import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Write-gate keanggotaan project pada event (src/routes/events/write.route.ts):
//   event dengan projectId hanya bisa dibuat/dipindahkan oleh anggota project
//   dengan role yang boleh menulis (OWNER / PM / MEMBER), atau system admin.
//   VIEWER dan non-anggota → 403. Event tanpa projectId tetap bebas.
const app = createTestApp()

let projectId = ''
let otherProjectId = ''
const tokens: Record<string, string> = {}
const userIds: Record<string, string> = {}

async function seedActor(
  key: string,
  opts: { systemRole?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'; projectRole?: 'OWNER' | 'PM' | 'MEMBER' | 'VIEWER' } = {},
) {
  const u = await seedTestUser(`evacc-${key}@example.com`, 'x', key, opts.systemRole ?? 'USER')
  userIds[key] = u.id
  tokens[key] = await createTestSession(u.id)
  if (opts.projectRole) {
    await prisma.projectMember.create({ data: { projectId, userId: u.id, role: opts.projectRole } })
  }
  return u
}

beforeAll(async () => {
  // Tiap file test memanggil prisma.$disconnect() di afterAll-nya, dan bun test
  // menjalankan semua file dalam satu proses dengan client prisma yang sama —
  // jadi connect ulang di sini supaya file ini tidak tergantung urutan jalan.
  await prisma.$connect()
  await cleanupTestData()

  const owner = await seedTestUser('evacc-owner@example.com', 'x', 'owner', 'USER')
  userIds.owner = owner.id
  tokens.owner = await createTestSession(owner.id)

  const project = await prisma.project.create({
    data: { name: 'Events access', ownerId: owner.id, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE' },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: owner.id, role: 'OWNER' } })

  // Project kedua: tujuan pemindahan event yang caller bukan anggotanya.
  const other = await prisma.project.create({
    data: { name: 'Events access other', ownerId: owner.id, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE' },
  })
  otherProjectId = other.id
  await prisma.projectMember.create({ data: { projectId: otherProjectId, userId: owner.id, role: 'OWNER' } })

  await seedActor('member', { projectRole: 'MEMBER' })
  await seedActor('viewer', { projectRole: 'VIEWER' })
  await seedActor('outsider')
  await seedActor('admin', { systemRole: 'SUPER_ADMIN' })
  // Prisma cold-connect bisa >5s di mesin yang sibuk, di atas default hook timeout.
}, 60_000)

afterAll(async () => {
  await cleanupTestData()
}, 60_000)

const futureIso = (hours = 24) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

function createEvent(token: string, body: Record<string, unknown>) {
  return app.handle(
    new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ title: 'Event akses', startsAt: futureIso(), ...body }),
    }),
  )
}

function patchEvent(token: string, id: string, body: Record<string, unknown>) {
  return app.handle(
    new Request(`http://localhost/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/events — write-gate keanggotaan project', () => {
  test('non-anggota & bukan system admin → 403', async () => {
    const res = await createEvent(tokens.outsider, { projectId, title: 'Event outsider' })
    expect(res.status).toBe(403)
    const count = await prisma.event.count({ where: { title: 'Event outsider' } })
    expect(count).toBe(0)
  })

  test('anggota role MEMBER → berhasil, tersimpan dengan projectId itu', async () => {
    const res = await createEvent(tokens.member, { projectId, title: 'Event member' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { event: { id: string; projectId: string | null } }
    expect(body.event.projectId).toBe(projectId)

    const stored = await prisma.event.findUnique({ where: { id: body.event.id } })
    expect(stored?.projectId).toBe(projectId)
    expect(stored?.createdById).toBe(userIds.member)
  })

  test('anggota role VIEWER → 403', async () => {
    const res = await createEvent(tokens.viewer, { projectId, title: 'Event viewer' })
    expect(res.status).toBe(403)
    const count = await prisma.event.count({ where: { title: 'Event viewer' } })
    expect(count).toBe(0)
  })

  test('system admin walau bukan anggota → berhasil', async () => {
    const res = await createEvent(tokens.admin, { projectId, title: 'Event admin' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { event: { projectId: string | null } }
    expect(body.event.projectId).toBe(projectId)

    const membership = await prisma.projectMember.findFirst({ where: { projectId, userId: userIds.admin } })
    expect(membership).toBeNull()
  })

  test('tanpa projectId oleh user biasa → tetap berhasil (regresi)', async () => {
    const res = await createEvent(tokens.outsider, { title: 'Event pribadi' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { event: { projectId: string | null; createdById: string } }
    expect(body.event.projectId).toBeNull()
    expect(body.event.createdById).toBe(userIds.outsider)
  })

  test('projectId yang tidak ada → 400', async () => {
    const res = await createEvent(tokens.member, { projectId: 'project-tidak-ada', title: 'Event hantu' })
    expect(res.status).toBe(400)
    const count = await prisma.event.count({ where: { title: 'Event hantu' } })
    expect(count).toBe(0)
  })
})

describe('PATCH /api/events/:id — pindah project', () => {
  test('pindah ke project yang caller bukan anggotanya → 403', async () => {
    // Event milik `member` sendiri, jadi 403 di bawah murni soal project tujuan,
    // bukan gate kreator/admin yang sudah ada.
    const event = await prisma.event.create({
      data: { title: 'Event mau dipindah', startsAt: new Date(Date.now() + 36e5), createdById: userIds.member, projectId },
    })

    const res = await patchEvent(tokens.member, event.id, { projectId: otherProjectId })
    expect(res.status).toBe(403)

    const stored = await prisma.event.findUnique({ where: { id: event.id } })
    expect(stored?.projectId).toBe(projectId)
  })
})
