import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

// Integritas batch pada POST /api/tasks/reorder — dua regresi.
//
// (1) Atomicity. Handler dulu memakai `Promise.all` dari update independen,
// yang bukan transaksi: kalau update ke-7 dari 12 gagal, enam yang pertama
// sudah commit dan sisanya tidak pernah jalan. Board tertinggal separuh
// ter-reorder — kanbanOrder bertabrakan/berlubang dan sebagian task berpindah
// status sementara saudaranya tidak — padahal user melihat request gagal.
// Sekarang semua update task + baris TaskStatusChange-nya masuk satu
// `prisma.$transaction`, jadi kegagalan di tengah batch tidak menulis apa pun.
//
// (2) Validasi status. `buildReorderUpdateData` dulu menulis string `status`
// apa pun yang dikirim klien, tanpa cek apakah transisinya legal untuk `kind`
// task tersebut. Jadi satu drag di UI Kanban bisa memaksa task QC langsung ke
// status yang melewati gate QC. Sekarang tiap baris yang membawa `status`
// dilewatkan ke getAllowedTaskTransitions — state machine yang sama dipakai
// PATCH /api/tasks/:id — dan satu baris ilegal menolak seluruh batch (400).
const app = createTestApp()

let ownerId = ''
let ownerToken = ''
let assigneeId = ''
let projectId = ''

function reorder(updates: Array<{ id: string; kanbanOrder: number; status?: string }>, token = ownerToken) {
  return app.handle(
    new Request('http://localhost/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
      body: JSON.stringify({ updates }),
    }),
  )
}

function seedTask(
  title: string,
  kanbanOrder: number,
  overrides: {
    status?: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
    kind?: 'TASK' | 'BUG' | 'QC' | 'TICKET' | 'IDEA'
    assigneeId?: string | null
  } = {},
) {
  return prisma.task.create({
    data: {
      projectId,
      reporterId: ownerId,
      title,
      description: 'd',
      kanbanOrder,
      status: overrides.status ?? 'OPEN',
      kind: overrides.kind ?? 'TASK',
      assigneeId: overrides.assigneeId ?? null,
    },
  })
}

/** Snapshot of the fields a reorder is allowed to touch. */
async function snapshot(ids: string[]) {
  const rows = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, kanbanOrder: true, status: true, closedAt: true },
    orderBy: { title: 'asc' },
  })
  return rows
}

beforeAll(async () => {
  // Tiap file test memanggil prisma.$disconnect() di afterAll-nya, dan bun test
  // menjalankan semua file dalam satu proses dengan client prisma yang sama —
  // jadi connect ulang di sini supaya file ini tidak tergantung urutan jalan.
  await prisma.$connect()
  await cleanupTestData()

  const owner = await seedTestUser('reorder-integrity-owner@example.com', 'x', 'Owner', 'USER')
  ownerId = owner.id
  ownerToken = await createTestSession(owner.id)

  const assignee = await seedTestUser('reorder-integrity-assignee@example.com', 'x', 'Assignee', 'USER')
  assigneeId = assignee.id

  const project = await prisma.project.create({
    data: {
      name: 'Reorder integrity',
      ownerId,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
    },
  })
  projectId = project.id
  await prisma.projectMember.create({ data: { projectId, userId: ownerId, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId, userId: assigneeId, role: 'MEMBER' } })
  // Prisma cold-connect bisa >5s di mesin yang sibuk, di atas default hook timeout.
}, 60_000)

afterAll(async () => {
  await cleanupTestData()
}, 60_000)

describe('POST /api/tasks/reorder — atomicity', () => {
  test('multi-task reorder with a legal status change applies every row', async () => {
    const [a, b, c] = await Promise.all([
      seedTask('mt-a', 0),
      seedTask('mt-b', 1),
      seedTask('mt-c', 2, { assigneeId }),
    ])

    const res = await reorder([
      { id: a!.id, kanbanOrder: 2 },
      { id: b!.id, kanbanOrder: 0 },
      { id: c!.id, kanbanOrder: 1, status: 'IN_PROGRESS' },
    ])
    expect(res.status).toBe(200)

    const after = await snapshot([a!.id, b!.id, c!.id])
    const byId = new Map(after.map((t) => [t.id, t]))
    expect(byId.get(a!.id)!.kanbanOrder).toBe(2)
    expect(byId.get(b!.id)!.kanbanOrder).toBe(0)
    expect(byId.get(c!.id)!.kanbanOrder).toBe(1)
    expect(byId.get(c!.id)!.status).toBe('IN_PROGRESS')
    // Pure-reorder rows keep their status.
    expect(byId.get(a!.id)!.status).toBe('OPEN')

    // Exactly one history row, for the one row that actually transitioned.
    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: { in: [a!.id, b!.id, c!.id] } } })
    expect(changes).toHaveLength(1)
    expect(changes[0]!.taskId).toBe(c!.id)
    expect(changes[0]!.fromStatus).toBe('OPEN')
    expect(changes[0]!.toStatus).toBe('IN_PROGRESS')
  })

  test('a row that fails at the DB level rolls back the ENTIRE batch', async () => {
    // kanbanOrder is an int4; 2**31 is out of range, so Postgres rejects that
    // one statement. Under the old Promise.all the earlier updates had already
    // committed — this is the assertion that actually proves the transaction.
    const [a, b, c, d] = await Promise.all([
      seedTask('rb-a', 10),
      seedTask('rb-b', 11),
      seedTask('rb-c', 12),
      seedTask('rb-d', 13),
    ])
    const ids = [a!.id, b!.id, c!.id, d!.id]
    const before = await snapshot(ids)

    const res = await reorder([
      { id: a!.id, kanbanOrder: 0 },
      { id: b!.id, kanbanOrder: 1, status: 'IN_PROGRESS' },
      { id: c!.id, kanbanOrder: 2_147_483_648 }, // out of int4 range → rejected
      { id: d!.id, kanbanOrder: 3 },
    ])
    expect(res.status).toBeGreaterThanOrEqual(400)

    // Nothing written: every row still holds its seeded kanbanOrder/status.
    expect(await snapshot(ids)).toEqual(before)
    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: { in: ids } } })
    expect(changes).toHaveLength(0)
  })

  test('unknown task id in the batch writes nothing (404)', async () => {
    const [a, b] = await Promise.all([seedTask('nf-a', 20), seedTask('nf-b', 21)])
    const ids = [a!.id, b!.id]
    const before = await snapshot(ids)

    const res = await reorder([
      { id: a!.id, kanbanOrder: 0 },
      { id: 'does-not-exist', kanbanOrder: 1 },
      { id: b!.id, kanbanOrder: 2 },
    ])
    expect(res.status).toBe(404)
    expect(await snapshot(ids)).toEqual(before)
  })
})

describe('POST /api/tasks/reorder — status validation', () => {
  test('illegal transition → 400 naming the task and the transition', async () => {
    // QC lifecycle: OPEN → IN_PROGRESS | CLOSED. OPEN → READY_FOR_QC would
    // skip the work stage, i.e. drop the card straight past the QC gate.
    const qc = await seedTask('qc-skip', 30, { kind: 'QC', status: 'OPEN' })

    const res = await reorder([{ id: qc.id, kanbanOrder: 0, status: 'READY_FOR_QC' }])
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain(qc.id)
    expect(body.error).toContain('OPEN')
    expect(body.error).toContain('READY_FOR_QC')
    expect(body.error).toContain('QC')

    const after = await prisma.task.findUniqueOrThrow({ where: { id: qc.id } })
    expect(after.status).toBe('OPEN')
    expect(after.kanbanOrder).toBe(30)
  })

  test('one illegal row rejects the whole batch and writes nothing', async () => {
    const [a, b] = await Promise.all([
      seedTask('mix-a', 40),
      seedTask('mix-b', 41, { kind: 'QC', status: 'OPEN' }),
    ])
    const ids = [a!.id, b!.id]
    const before = await snapshot(ids)

    const res = await reorder([
      { id: a!.id, kanbanOrder: 0, status: 'IN_PROGRESS' }, // legal on its own
      { id: b!.id, kanbanOrder: 1, status: 'READY_FOR_QC' }, // illegal for QC from OPEN
    ])
    expect(res.status).toBe(400)

    // The legal row must NOT have been applied — all-or-nothing.
    expect(await snapshot(ids)).toEqual(before)
    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: { in: ids } } })
    expect(changes).toHaveLength(0)
  })

  test('legal QC gate path (IN_PROGRESS → READY_FOR_QC) still passes', async () => {
    const qc = await seedTask('qc-ok', 50, { kind: 'QC', status: 'IN_PROGRESS', assigneeId })

    const res = await reorder([{ id: qc.id, kanbanOrder: 0, status: 'READY_FOR_QC' }])
    expect(res.status).toBe(200)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: qc.id } })
    expect(after.status).toBe('READY_FOR_QC')

    const change = await prisma.taskStatusChange.findFirst({ where: { taskId: qc.id } })
    expect(change?.fromStatus).toBe('IN_PROGRESS')
    expect(change?.toStatus).toBe('READY_FOR_QC')

    // Notifications are dispatched after the transaction commits, and awaited,
    // so the row exists by the time the response lands.
    const notif = await prisma.notification.findFirst({
      where: { taskId: qc.id, recipientId: assigneeId, kind: 'TASK_STATUS_CHANGED' },
    })
    expect(notif).not.toBeNull()
  })

  test('re-sending the current status is a no-op, not a 400', async () => {
    const t = await seedTask('noop', 60, { status: 'OPEN' })

    const res = await reorder([{ id: t.id, kanbanOrder: 1, status: 'OPEN' }])
    expect(res.status).toBe(200)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: t.id } })
    expect(after.kanbanOrder).toBe(1)
    expect(after.status).toBe('OPEN')
    // No transition → no history row.
    const changes = await prisma.taskStatusChange.findMany({ where: { taskId: t.id } })
    expect(changes).toHaveLength(0)
  })

  test('IDEA cannot be dragged into IN_PROGRESS', async () => {
    const idea = await seedTask('idea', 70, { kind: 'IDEA', status: 'OPEN' })

    const res = await reorder([{ id: idea.id, kanbanOrder: 0, status: 'IN_PROGRESS' }])
    expect(res.status).toBe(400)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: idea.id } })
    expect(after.status).toBe('OPEN')
  })
})
