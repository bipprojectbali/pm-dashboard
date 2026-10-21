import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Write-gate lintas-project pada POST /api/tasks/reorder.
// Regresi: handler dulu hanya me-resolve project dari `updates[0]` lalu
// mengotorisasi caller terhadap satu project itu, padahal loop update menulis
// ke SEMUA id. Caller cukup menaruh task project miliknya di indeks 0 lalu
// menempelkan task project lain — kanbanOrder DAN status task asing ikut
// berubah beserta side effect status (TaskStatusChange + notifikasi).
// Sekarang tiap project yang disentuh harus lolos gate yang sama, dan satu
// project yang gagal menolak seluruh request (403, tanpa tulisan apa pun).
const app = createTestApp()

let memberId = ''
let memberToken = ''
let outsiderOwnerId = ''
let projectAId = ''
let projectBId = ''

function reorder(updates: Array<{ id: string; kanbanOrder: number; status?: string }>, token = memberToken) {
  return app.handle(
    new Request('http://localhost/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ updates }),
    }),
  )
}

function seedTask(projectId: string, reporterId: string, title: string, kanbanOrder: number) {
  return prisma.task.create({
    data: { projectId, reporterId, title, description: 'd', status: 'OPEN', kanbanOrder },
  })
}

beforeAll(async () => {
  // Tiap file test memanggil prisma.$disconnect() di afterAll-nya, dan bun test
  // menjalankan semua file dalam satu proses dengan client prisma yang sama —
  // jadi connect ulang di sini supaya file ini tidak tergantung urutan jalan.
  await prisma.$connect()
  await cleanupTestData()

  // Caller: user biasa (bukan system admin) dengan role MEMBER di project A saja.
  const member = await seedTestUser('reorder-authz-member@example.com', 'x', 'Member', 'USER')
  memberId = member.id
  memberToken = await createTestSession(member.id)

  // Owner project B — caller sama sekali bukan anggota di sini.
  const outsiderOwner = await seedTestUser('reorder-authz-owner-b@example.com', 'x', 'Owner B', 'USER')
  outsiderOwnerId = outsiderOwner.id

  const projectA = await prisma.project.create({
    data: { name: 'Reorder authz A', ownerId: memberId, status: 'ACTIVE', priority: 'MEDIUM', visibility: 'PRIVATE' },
  })
  projectAId = projectA.id
  await prisma.projectMember.create({ data: { projectId: projectAId, userId: memberId, role: 'MEMBER' } })

  const projectB = await prisma.project.create({
    data: {
      name: 'Reorder authz B',
      ownerId: outsiderOwnerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
    },
  })
  projectBId = projectB.id
  await prisma.projectMember.create({ data: { projectId: projectBId, userId: outsiderOwnerId, role: 'OWNER' } })
  // Prisma cold-connect bisa >5s di mesin yang sibuk, di atas default hook timeout.
}, 60_000)

afterAll(async () => {
  await cleanupTestData()
}, 60_000)

describe('POST /api/tasks/reorder — otorisasi semua project yang disentuh', () => {
  test('menempelkan task project lain pada batch → 403 dan task asing tidak berubah', async () => {
    const mine = await seedTask(projectAId, memberId, 'Task A', 0)
    const foreign = await seedTask(projectBId, outsiderOwnerId, 'Task B', 5)

    const res = await reorder([
      { id: mine.id, kanbanOrder: 1 },
      { id: foreign.id, kanbanOrder: 0, status: 'CLOSED' },
    ])
    expect(res.status).toBe(403)

    const afterForeign = await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } })
    expect(afterForeign.kanbanOrder).toBe(5)
    expect(afterForeign.status).toBe('OPEN')
    expect(afterForeign.closedAt).toBeNull()

    // Tidak ada tulisan parsial: task caller sendiri pun tidak bergeser.
    const afterMine = await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })
    expect(afterMine.kanbanOrder).toBe(0)

    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: foreign.id } })
    expect(changes).toHaveLength(0)
  })

  test('task asing di indeks 0 pun tetap 403 (gate tidak tergantung urutan)', async () => {
    const foreign = await seedTask(projectBId, outsiderOwnerId, 'Task B first', 3)
    const mine = await seedTask(projectAId, memberId, 'Task A second', 0)

    const res = await reorder([
      { id: foreign.id, kanbanOrder: 9 },
      { id: mine.id, kanbanOrder: 1 },
    ])
    expect(res.status).toBe(403)

    const afterForeign = await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } })
    expect(afterForeign.kanbanOrder).toBe(3)
  })

  test('reorder sah dalam satu project → 200 dan urutan baru tersimpan', async () => {
    const t1 = await seedTask(projectAId, memberId, 'Golden 1', 0)
    const t2 = await seedTask(projectAId, memberId, 'Golden 2', 1)

    const res = await reorder([
      { id: t1.id, kanbanOrder: 1 },
      { id: t2.id, kanbanOrder: 0 },
    ])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const [after1, after2] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: t1.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: t2.id } }),
    ])
    expect(after1.kanbanOrder).toBe(1)
    expect(after2.kanbanOrder).toBe(0)
  })

  test('id task yang tidak ada → 404', async () => {
    const mine = await seedTask(projectAId, memberId, 'Ghost batch', 0)

    const res = await reorder([
      { id: mine.id, kanbanOrder: 1 },
      { id: 'task-tidak-ada', kanbanOrder: 2 },
    ])
    expect(res.status).toBe(404)

    const afterMine = await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })
    expect(afterMine.kanbanOrder).toBe(0)
  })
})
