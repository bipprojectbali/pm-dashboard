// Overdue lock closes READS, not just writes: a locked project is only openable
// by system admins, plus its OWNER who gets a reduced lock-screen payload so the
// lock still has an exit. Everyone else gets 403 — PM included, and including on
// the routes scoped under the project, otherwise the denial would be cosmetic.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { withLockBypass } from '../../src/lib/prisma-project-lock'
import { invalidateProjectLockCache, LOCK_GRACE_SETTING_KEY } from '../../src/lib/project-lock'
import { createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()
const DAY_MS = 86_400_000

let ownerToken = ''
let pmToken = ''
let memberToken = ''
let viewerToken = ''
let adminToken = ''
let outsiderToken = ''

let lockedProjectId = ''
let healthyProjectId = ''
let lockedTaskId = ''
let healthyTaskId = ''
let previousGrace: string | null = null

const EMAILS = [
  'rd-owner@example.com',
  'rd-pm@example.com',
  'rd-member@example.com',
  'rd-viewer@example.com',
  'rd-admin@example.com',
  'rd-outsider@example.com',
]

function req(session: string | null, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { cookie: `session=${session}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

beforeAll(async () => {
  const owner = await seedTestUser('rd-owner@example.com', 'pass123', 'RD Owner')
  const pm = await seedTestUser('rd-pm@example.com', 'pass123', 'RD PM')
  const member = await seedTestUser('rd-member@example.com', 'pass123', 'RD Member')
  const viewer = await seedTestUser('rd-viewer@example.com', 'pass123', 'RD Viewer')
  const admin = await seedTestUser('rd-admin@example.com', 'pass123', 'RD Admin', 'SUPER_ADMIN')
  const outsider = await seedTestUser('rd-outsider@example.com', 'pass123', 'RD Outsider')

  ownerToken = await createTestSession(owner.id)
  pmToken = await createTestSession(pm.id)
  memberToken = await createTestSession(member.id)
  viewerToken = await createTestSession(viewer.id)
  adminToken = await createTestSession(admin.id)
  outsiderToken = await createTestSession(outsider.id)

  const members = {
    create: [
      { userId: owner.id, role: 'OWNER' as const },
      { userId: pm.id, role: 'PM' as const },
      { userId: member.id, role: 'MEMBER' as const },
      { userId: viewer.id, role: 'VIEWER' as const },
    ],
  }
  const now = Date.now()

  // Dibuat sehat dulu, dituakan di akhir beforeAll. Guard di lapisan data
  // (src/lib/prisma-project-lock.ts) menolak setiap tulis ke project terkunci,
  // termasuk tulisan dari test setup — jadi fixture ini harus diisi selagi
  // project-nya masih bisa ditulis, bukan dibuat terkunci sejak awal.
  const locked = await prisma.project.create({
    data: {
      name: 'RD Locked',
      description: 'proyek terkunci',
      ownerId: owner.id,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      endsAt: new Date(now + 30 * DAY_MS),
      members,
    },
  })
  lockedProjectId = locked.id

  const healthy = await prisma.project.create({
    data: {
      name: 'RD Healthy',
      description: 'proyek sehat',
      ownerId: owner.id,
      status: 'ACTIVE',
      priority: 'MEDIUM',
      visibility: 'PRIVATE',
      endsAt: new Date(now + 30 * DAY_MS),
      members,
    },
  })
  healthyProjectId = healthy.id

  lockedTaskId = (
    await prisma.task.create({
      data: {
        projectId: lockedProjectId,
        reporterId: owner.id,
        title: 'Task di project terkunci',
        description: '',
        kind: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    })
  ).id
  healthyTaskId = (
    await prisma.task.create({
      data: {
        projectId: healthyProjectId,
        reporterId: owner.id,
        title: 'Task di project sehat',
        description: '',
        kind: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    })
  ).id

  previousGrace = (await prisma.appSetting.findUnique({ where: { key: LOCK_GRACE_SETTING_KEY } }))?.value ?? null
  await prisma.appSetting.upsert({
    where: { key: LOCK_GRACE_SETTING_KEY },
    update: { value: '7' },
    create: { key: LOCK_GRACE_SETTING_KEY, value: '7' },
  })

  // Baru sekarang project-nya dituakan: 30 hari lewat deadline dengan grace 7
  // hari → LOCKED. Update ini tidak butuh withLockBypass — guard menghitung
  // state lock dari baris yang ada saat ini, dan baris itu masih sehat ketika
  // update dieksekusi, jadi lolos secara sah.
  await prisma.project.update({
    where: { id: lockedProjectId },
    data: { endsAt: new Date(now - 30 * DAY_MS) },
  })
  invalidateProjectLockCache()
})

afterAll(async () => {
  if (previousGrace === null) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_GRACE_SETTING_KEY } })
  } else {
    await prisma.appSetting.update({ where: { key: LOCK_GRACE_SETTING_KEY }, data: { value: previousGrace } })
  }
  invalidateProjectLockCache()
  const ids = [lockedProjectId, healthyProjectId]
  // Scoped cleanup, not cleanupTestData(): the integration suite shares one
  // database, and a mass delete would take other files' fixtures with it.
  // Teardown lewat bypass: project-nya sengaja ditinggalkan dalam keadaan
  // terkunci, dan guard lapisan data menolak delete pada task/projectMember/
  // projectExtension miliknya. Teardown test adalah salah satu pemakaian
  // withLockBypass yang memang disahkan di komentar modul guard.
  await withLockBypass(async () => {
    await prisma.notification.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectExtension.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.task.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.projectMember.deleteMany({ where: { projectId: { in: ids } } })
    await prisma.project.deleteMany({ where: { id: { in: ids } } })
  })
  await prisma.session.deleteMany({
    where: { token: { in: [ownerToken, pmToken, memberToken, viewerToken, adminToken, outsiderToken] } },
  })
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } })
})

describe('project terkunci — detail ditolak untuk anggota biasa', () => {
  test('MEMBER dapat 403 dan ditandai locked', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; locked: boolean }
    // `locked` membedakan "dibekukan menunggu keputusan" dari "tidak punya akses".
    expect(body.locked).toBe(true)
  })

  test('VIEWER dapat 403', async () => {
    const res = await req(viewerToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { locked: boolean }).locked).toBe(true)
  })

  test('bukan anggota dapat 403', async () => {
    const res = await req(outsiderToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(403)
  })
})

describe('project terkunci — hanya OWNER dapat payload layar kunci', () => {
  test('OWNER dapat 200 tanpa data berat', async () => {
    const res = await req(ownerToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      project: Record<string, unknown>
      myRole: string
      canWrite: boolean
      canDecide: boolean
      lockedView: boolean
      lock: { locked: boolean; stage: string; overdueDays: number; graceDays: number }
    }
    expect(data.lockedView).toBe(true)
    expect(data.lock.locked).toBe(true)
    expect(data.lock.stage).toBe('LOCKED')
    expect(data.lock.graceDays).toBe(7)
    expect(data.lock.overdueDays).toBeGreaterThanOrEqual(30)
    // Peran asli, bukan hasil downgrade jadi VIEWER.
    expect(data.myRole).toBe('OWNER')
    expect(data.canWrite).toBe(false)
    expect(data.canDecide).toBe(true)

    // Cukup untuk mengenali project dan menjalankan keputusan…
    expect(Object.keys(data.project).sort()).toEqual(['endsAt', 'id', 'name', 'startsAt', 'status'])
    expect(data.project.id).toBe(lockedProjectId)
    expect(data.project.name).toBe('RD Locked')
    // …dan tidak lebih dari itu.
    for (const heavy of [
      'members',
      '_count',
      'taskStats',
      'milestoneStats',
      'owner',
      'description',
      'priority',
      'visibility',
      'githubRepo',
    ]) {
      expect(data.project[heavy]).toBeUndefined()
    }
  })

  // Carve-out dipersempit: satu project bisa punya beberapa PM, dan tiap orang
  // tambahan yang bisa membuka kunci melemahkan tekanan untuk memutuskan.
  test('PM ikut ditolak 403 — carve-out sekarang hanya OWNER', async () => {
    const res = await req(pmToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; locked: boolean }
    expect(body.locked).toBe(true)
  })

  test('PM tidak bisa mendisposisi project terkunci', async () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      const res = await req(pmToken, 'PATCH', `/api/projects/${lockedProjectId}`, { status })
      expect(res.status).toBe(403)
      expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
    }
    // Dan project-nya memang tidak berubah.
    const after = await prisma.project.findUnique({ where: { id: lockedProjectId }, select: { status: true } })
    expect(after?.status).toBe('ACTIVE')
  })

  test('PM tidak bisa memperpanjang deadline project terkunci', async () => {
    const res = await req(pmToken, 'POST', `/api/projects/${lockedProjectId}/extend`, {
      newEndAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
      reason: 'PM coba membuka kunci',
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { locked?: boolean }).locked).toBe(true)
    // Masih terkunci untuk anggota biasa — percobaan PM tidak boleh berefek.
    expect((await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)).status).toBe(403)
  })

  test('PM tidak bisa melihat access token project terkunci', async () => {
    const res = await req(pmToken, 'GET', `/api/projects/${lockedProjectId}/access-tokens`)
    expect(res.status).toBe(403)
  })

  test('admin sistem tetap dapat payload penuh', async () => {
    const res = await req(adminToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      project: { members: unknown[]; taskStats: { total: number }; description: string | null }
      lockedView?: boolean
      canDecide: boolean
      lock: { locked: boolean }
    }
    expect(data.lockedView).toBeUndefined()
    expect(data.lock.locked).toBe(true)
    expect(data.canDecide).toBe(true)
    expect(Array.isArray(data.project.members)).toBe(true)
    expect(data.project.members.length).toBe(4)
    expect(data.project.taskStats.total).toBeGreaterThanOrEqual(1)
  })
})

describe('project terkunci — sub-resource ikut tertutup', () => {
  // Tanpa ini penolakan di layar detail cuma kosmetik: isi project tetap
  // terbaca lewat route-route di bawahnya.
  const SUB_PATHS = [
    (id: string) => `/api/projects/${id}/milestones`,
    (id: string) => `/api/projects/${id}/phases`,
    (id: string) => `/api/projects/${id}/tags`,
    (id: string) => `/api/projects/${id}/retro`,
    (id: string) => `/api/projects/${id}/github/summary`,
    (id: string) => `/api/projects/${id}/github/feed`,
    (id: string) => `/api/projects/${id}/extensions`,
    (id: string) => `/api/tasks?projectId=${id}`,
    (id: string) => `/api/tasks/dashboard-stats?projectId=${id}`,
    (id: string) => `/api/tasks/dashboard-charts?projectId=${id}`,
  ]

  // Satu assert per daftar, bukan per path: kalau ada yang bocor, diff-nya
  // langsung menyebut route mana.
  async function statuses(session: string, projectId: string) {
    const out: string[] = []
    for (const build of SUB_PATHS) {
      const path = build(projectId)
      out.push(`${path} -> ${(await req(session, 'GET', path)).status}`)
    }
    return out
  }

  const expected = (projectId: string, status: number) =>
    SUB_PATHS.map((build) => `${build(projectId)} -> ${status}`)

  test('MEMBER ditolak di semua sub-resource project terkunci', async () => {
    expect(await statuses(memberToken, lockedProjectId)).toEqual(expected(lockedProjectId, 403))
  })

  test('OWNER juga ditolak — carve-out hanya untuk layar keputusan', async () => {
    expect(await statuses(ownerToken, lockedProjectId)).toEqual(expected(lockedProjectId, 403))
  })

  test('MEMBER tetap bisa membaca sub-resource project sehat', async () => {
    expect(await statuses(memberToken, healthyProjectId)).toEqual(expected(healthyProjectId, 200))
  })

  test('admin sistem tetap bisa membaca sub-resource project terkunci', async () => {
    const res = await req(adminToken, 'GET', `/api/projects/${lockedProjectId}/milestones`)
    expect(res.status).toBe(200)
  })
})

describe('project terkunci — detail task ikut tertutup', () => {
  test('MEMBER tidak bisa membuka task project terkunci', async () => {
    const res = await req(memberToken, 'GET', `/api/tasks/${lockedTaskId}`)
    expect(res.status).toBe(403)
  })

  test('MEMBER tetap bisa membuka task project sehat', async () => {
    const res = await req(memberToken, 'GET', `/api/tasks/${healthyTaskId}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { task: { id: string } }).task.id).toBe(healthyTaskId)
  })

  test('admin sistem tetap bisa membuka task project terkunci', async () => {
    const res = await req(adminToken, 'GET', `/api/tasks/${lockedTaskId}`)
    expect(res.status).toBe(200)
  })

  test('file evidence task project terkunci ditolak sebelum menyentuh storage', async () => {
    const res = await req(memberToken, 'GET', `/api/evidence/apa-saja.png?task=${lockedTaskId}`)
    expect(res.status).toBe(403)
  })
})

describe('daftar project tetap menampilkan yang terkunci', () => {
  test('MEMBER masih melihat project terkunci di daftar, ditandai locked', async () => {
    const res = await req(memberToken, 'GET', '/api/projects')
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      projects: { id: string; myRole: string; canWrite: boolean; lock: { locked: boolean; stage: string } }[]
    }
    const row = data.projects.find((p) => p.id === lockedProjectId)
    // Anggota harus tahu project-nya ada dan sedang terkunci — kalau hilang dari
    // daftar, yang terjadi malah proyeknya seolah terhapus.
    expect(row).toBeDefined()
    expect(row?.lock.locked).toBe(true)
    expect(row?.lock.stage).toBe('LOCKED')
    expect(row?.canWrite).toBe(false)
    expect(row?.myRole).toBe('MEMBER')
  })
})

describe('project tidak terkunci — tidak ada yang berubah', () => {
  test('MEMBER dapat payload penuh seperti sebelumnya', async () => {
    const res = await req(memberToken, 'GET', `/api/projects/${healthyProjectId}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      project: { id: string; members: unknown[]; taskStats: { total: number }; description: string | null }
      myRole: string
      canWrite: boolean
      canDecide: boolean
      lockedView?: boolean
      lock: { locked: boolean; stage: string }
    }
    expect(data.lockedView).toBeUndefined()
    expect(data.lock.locked).toBe(false)
    expect(data.myRole).toBe('MEMBER')
    expect(data.canWrite).toBe(true)
    expect(data.canDecide).toBe(false)
    expect(data.project.id).toBe(healthyProjectId)
    expect(Array.isArray(data.project.members)).toBe(true)
    expect(data.project.members.length).toBe(4)
    expect(data.project.description).toBe('proyek sehat')
    expect(data.project.taskStats.total).toBeGreaterThanOrEqual(1)
  })
})

// Kehilangan carve-out kunci tidak boleh merembet ke wewenang normal PM: yang
// dicabut hanya kemampuan membuka project yang sudah terkunci.
describe('project sehat — wewenang normal PM utuh', () => {
  test('PM dapat payload penuh, tapi canDecide false', async () => {
    const res = await req(pmToken, 'GET', `/api/projects/${healthyProjectId}`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      project: { members: unknown[] }
      myRole: string
      canWrite: boolean
      canDecide: boolean
    }
    expect(data.myRole).toBe('PM')
    expect(data.canWrite).toBe(true)
    expect(data.canDecide).toBe(false)
    expect(Array.isArray(data.project.members)).toBe(true)
  })

  test('PM masih bisa mengubah field project sehat', async () => {
    const res = await req(pmToken, 'PATCH', `/api/projects/${healthyProjectId}`, { priority: 'HIGH' })
    expect(res.status).toBe(200)
  })

  test('PM masih bisa memperpanjang deadline project sehat', async () => {
    const res = await req(pmToken, 'POST', `/api/projects/${healthyProjectId}/extend`, {
      newEndAt: new Date(Date.now() + 60 * DAY_MS).toISOString(),
      reason: 'geser jadwal',
    })
    expect(res.status).toBe(200)
  })

  test('PM masih bisa melihat access token project sehat', async () => {
    const res = await req(pmToken, 'GET', `/api/projects/${healthyProjectId}/access-tokens`)
    expect(res.status).toBe(200)
  })
})

describe('keputusan membuka kembali akses', () => {
  test('setelah deadline diperpanjang, MEMBER bisa membaca lagi', async () => {
    const res = await req(ownerToken, 'POST', `/api/projects/${lockedProjectId}/extend`, {
      newEndAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
      reason: 'butuh waktu tambahan',
    })
    expect(res.status).toBe(200)

    const after = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(after.status).toBe(200)
    const data = (await after.json()) as {
      project: { members: unknown[] }
      lockedView?: boolean
      lock: { locked: boolean }
    }
    expect(data.lock.locked).toBe(false)
    expect(data.lockedView).toBeUndefined()
    expect(Array.isArray(data.project.members)).toBe(true)

    // Kembalikan ke keadaan terkunci supaya urutan test tidak saling bergantung.
    await prisma.project.update({
      where: { id: lockedProjectId },
      data: { endsAt: new Date(Date.now() - 30 * DAY_MS) },
    })
    const relocked = await req(memberToken, 'GET', `/api/projects/${lockedProjectId}`)
    expect(relocked.status).toBe(403)
  })

  test('MEMBER yang terkunci masih bisa minta keputusan', async () => {
    // Satu-satunya aksi yang tersisa untuk anggota yang terblokir — jalur ini
    // memakai role asli, jadi tidak boleh ikut tertutup oleh penolakan baca.
    const res = await req(memberToken, 'POST', `/api/projects/${lockedProjectId}/request-decision`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
  })
})
