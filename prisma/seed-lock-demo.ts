// Fixture dev-only untuk overdue project lock: bikin satu project di tiap stage
// (ON_TIME → LOCKED) plus user di tiap role, supaya layar kunci, tint merah, dan
// carve-out keputusan bisa diklik langsung di browser.
//
// Hanya menambah baris ber-prefix DEMO-LOCK; tidak pernah menyentuh data dev yang
// sudah ada, dan tidak di-wire ke `db:seed` (yang itu wipe seluruh DB).
//
// Urutannya penting. Guard write di `src/lib/prisma-project-lock.ts` menolak
// setiap write ke project yang SUDAH terkunci, termasuk dari script. Jadi tiap
// project dibuat sehat dulu → semua anak ditulis → baru `endsAt`-nya dituakan.
// Guard menghitung lock dari baris apa adanya, dan pada saat update itu barisnya
// masih sehat, sehingga tidak butuh bypass sama sekali. Bypass hanya dipakai di
// dua tempat yang memang menyentuh project terkunci: menyehatkan kembali fixture
// pada run kedua, dan cleanup.
import type { ProjectMemberRole, Role, TaskStatus } from '../generated/prisma'
import { prisma } from '../src/lib/db'
import { withLockBypass } from '../src/lib/prisma-project-lock'
import {
  DUE_SOON_LEAD_DAYS,
  computeLockState,
  escalateAfterDays,
  getLockGraceDays,
  type LockStage,
} from '../src/lib/project-lock'

const MARKER = 'DEMO-LOCK'
// test-only: fixture lokal, bukan kredensial siapa pun.
const DEMO_PASSWORD = 'demolock123'
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

// ── users ────────────────────────────────────────────────────────────────────

type DemoUser = {
  key: 'admin' | 'owner' | 'pm' | 'member' | 'viewer'
  name: string
  email: string
  role: Role
  memberRole: ProjectMemberRole | null // null = bukan anggota project (system admin)
  note: string
}

const DEMO_USERS: DemoUser[] = [
  {
    key: 'admin',
    name: `${MARKER} Admin Sistem`,
    email: 'demo-lock-admin@example.com',
    role: 'SUPER_ADMIN',
    memberRole: null,
    note: 'System admin — lolos lock sepenuhnya, tetap bisa tulis & baca',
  },
  {
    key: 'owner',
    name: `${MARKER} Owner`,
    email: 'demo-lock-owner@example.com',
    role: 'USER',
    memberRole: 'OWNER',
    note: 'OWNER — satu-satunya non-admin yang dapat layar keputusan saat locked',
  },
  {
    key: 'pm',
    name: `${MARKER} PM`,
    email: 'demo-lock-pm@example.com',
    role: 'USER',
    memberRole: 'PM',
    note: 'PM — penuh di project sehat, tapi 403 saat locked (bukan decider)',
  },
  {
    key: 'member',
    name: `${MARKER} Member`,
    email: 'demo-lock-member@example.com',
    role: 'USER',
    memberRole: 'MEMBER',
    note: 'MEMBER — saat locked dapat layar ditolak + tombol "Minta keputusan"',
  },
  {
    key: 'viewer',
    name: `${MARKER} Viewer`,
    email: 'demo-lock-viewer@example.com',
    role: 'USER',
    memberRole: 'VIEWER',
    note: 'VIEWER — read-only bahkan di project sehat, pembanding downgrade role',
  },
]

// ── projects ─────────────────────────────────────────────────────────────────

type DemoProject = { stage: LockStage; name: string; description: string }

const DEMO_PROJECTS: DemoProject[] = [
  {
    stage: 'ON_TIME',
    name: `${MARKER} 1 Sehat (ON_TIME)`,
    description: 'Deadline masih jauh. Kontrol: tidak boleh ada jejak merah di sini.',
  },
  {
    stage: 'DUE_SOON',
    name: `${MARKER} 2 Mendekat (DUE_SOON)`,
    description: 'Deadline beberapa hari lagi — peringatan awal, belum dikunci.',
  },
  {
    stage: 'OVERDUE',
    name: `${MARKER} 3 Terlambat (OVERDUE)`,
    description: 'Baru lewat deadline. Rung merah pertama, masih bisa ditulis.',
  },
  {
    stage: 'ESCALATED',
    name: `${MARKER} 4 Eskalasi (ESCALATED)`,
    description: 'Setengah masa tenggang terlewat. Rung merah kedua, masih bisa ditulis.',
  },
  {
    stage: 'LOCKED',
    name: `${MARKER} 5 Terkunci (LOCKED)`,
    description: 'Masa tenggang habis. Read-only; hanya OWNER / system admin yang bisa memutuskan.',
  },
]

/**
 * Offset `endsAt` relatif sekarang (ms; negatif = masa lalu) supaya
 * `computeLockState` mendarat tepat di `stage`. Semuanya diturunkan dari
 * `graceDays` yang dibaca runtime — jangan hardcode 7, karena setting
 * `project.lockGraceDays` bisa diubah dan fixture akan salah stage.
 *
 * Offset 2 jam di stage overdue menjaga `overdueDays` tetap >= 0 walau script
 * jalan beberapa detik; tanpa itu target "0 hari terlambat" bisa jadi -1.
 */
function endsAtOffsetMs(stage: LockStage, graceDays: number): number {
  const escalateAt = escalateAfterDays(graceDays)
  switch (stage) {
    case 'ON_TIME':
      return (DUE_SOON_LEAD_DAYS + 7) * DAY_MS
    case 'DUE_SOON':
      return 3 * DAY_MS
    case 'OVERDUE':
      return -2 * HOUR_MS
    case 'ESCALATED':
      return -(escalateAt * DAY_MS + 2 * HOUR_MS)
    case 'LOCKED':
      return -(graceDays * DAY_MS + 2 * HOUR_MS)
    default:
      throw new Error(`Stage ${stage} tidak dipakai fixture ini`)
  }
}

// ── tasks ────────────────────────────────────────────────────────────────────

type TaskTemplate = {
  title: string
  description: string
  status: TaskStatus
  kind: 'TASK' | 'BUG' | 'QC'
  assignee: DemoUser['key'] | null
  dueDays: number
  checklist?: string[]
  comment?: string
}

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    title: 'Siapkan rencana rilis',
    description: 'Rangkum scope dan urutan rilis supaya deadline bisa dinilai.',
    status: 'OPEN',
    kind: 'TASK',
    assignee: 'member',
    dueDays: 3,
    checklist: ['Kumpulkan scope', 'Sepakati urutan', 'Kirim ke stakeholder'],
  },
  {
    title: 'Implementasi modul inti',
    description: 'Pekerjaan utama; dipakai untuk mengisi kolom In Progress.',
    status: 'IN_PROGRESS',
    kind: 'TASK',
    assignee: 'member',
    dueDays: 1,
    comment: 'Progres jalan, menunggu review dari PM.',
  },
  {
    title: 'Review hasil modul inti',
    description: 'Masuk kolom Ready for QC supaya papan tidak kosong.',
    status: 'READY_FOR_QC',
    kind: 'QC',
    assignee: 'pm',
    dueDays: 2,
  },
  {
    title: 'Perbaiki bug form tanggal',
    description: 'Bug contoh supaya tab detail punya variasi kind.',
    status: 'OPEN',
    kind: 'BUG',
    assignee: null,
    dueDays: -1,
  },
  {
    title: 'Rapikan dokumentasi awal',
    description: 'Sudah selesai; mengisi kolom Closed dan metrik velocity.',
    status: 'CLOSED',
    kind: 'TASK',
    assignee: 'owner',
    dueDays: -5,
  },
]

const TAG_TEMPLATE: [string, string][] = [
  ['rilis', 'indigo'],
  ['blocker', 'red'],
]

// ── helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date()
const shift = (ms: number) => new Date(Date.now() + ms)

async function ensureUsers(): Promise<Map<DemoUser['key'], string>> {
  const ids = new Map<DemoUser['key'], string>()
  for (const u of DEMO_USERS) {
    // Login form memverifikasi User.password lewat Bun.password.verify
    // (src/routes/auth.handlers.ts), persis seperti prisma/seed.ts — jadi hash
    // bcrypt-nya dibuat dengan cara yang sama, bukan skema sendiri.
    const password = await Bun.password.hash(DEMO_PASSWORD, { algorithm: 'bcrypt' })
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, password, blocked: false },
      create: { name: u.name, email: u.email, role: u.role, password },
    })
    ids.set(u.key, rec.id)
  }
  console.log(`▶  Users: ${DEMO_USERS.length} fixture siap`)
  return ids
}

/**
 * Pastikan project fixture ada dan SEHAT (endsAt jauh di depan), supaya semua
 * write anak setelah ini lolos guard. Dibungkus `withLockBypass` karena pada run
 * kedua baris lamanya sudah terkunci, dan `project.update` ke baris terkunci
 * ditolak guard — justru update inilah yang membuatnya sehat kembali.
 */
async function ensureHealthyProject(p: DemoProject, ownerId: string): Promise<string> {
  return withLockBypass(async () => {
    const healthy = {
      description: p.description,
      ownerId,
      status: 'ACTIVE' as const,
      startsAt: shift(-30 * DAY_MS),
      endsAt: shift(60 * DAY_MS),
      originalEndAt: shift(60 * DAY_MS),
      archivedAt: null,
    }
    const existing = await prisma.project.findFirst({ where: { name: p.name }, select: { id: true } })
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data: healthy })
      return existing.id
    }
    const created = await prisma.project.create({ data: { name: p.name, ...healthy } })
    return created.id
  })
}

/** Buang anak-anak fixture dari run sebelumnya. Project sudah sehat di sini, jadi tanpa bypass. */
async function resetChildren(projectId: string) {
  const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } })
  const taskIds = tasks.map((t) => t.id)
  if (taskIds.length > 0) {
    const where = { taskId: { in: taskIds } }
    await prisma.taskStatusChange.deleteMany({ where })
    await prisma.taskComment.deleteMany({ where })
    await prisma.taskChecklistItem.deleteMany({ where })
    await prisma.taskTag.deleteMany({ where })
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } })
  }
  await prisma.tag.deleteMany({ where: { projectId } })
  await prisma.projectMilestone.deleteMany({ where: { projectId } })
  await prisma.projectMember.deleteMany({ where: { projectId } })
  // notification tidak punya FK ke project, jadi harus dibersihkan eksplisit.
  await prisma.notification.deleteMany({ where: { projectId } })
}

async function seedChildren(projectId: string, userIds: Map<DemoUser['key'], string>) {
  for (const u of DEMO_USERS) {
    if (!u.memberRole) continue
    await prisma.projectMember.create({
      data: { projectId, userId: userIds.get(u.key) as string, role: u.memberRole },
    })
  }

  const tags = new Map<string, string>()
  for (const [name, color] of TAG_TEMPLATE) {
    const tag = await prisma.tag.create({ data: { projectId, name, color } })
    tags.set(name, tag.id)
  }

  await prisma.projectMilestone.create({
    data: { projectId, title: 'Milestone 1 — scope disepakati', dueAt: shift(-10 * DAY_MS), completedAt: shift(-9 * DAY_MS), order: 1 },
  })
  await prisma.projectMilestone.create({
    data: { projectId, title: 'Milestone 2 — siap rilis', dueAt: shift(5 * DAY_MS), order: 2 },
  })

  const ownerId = userIds.get('owner') as string
  for (const [i, t] of TASK_TEMPLATES.entries()) {
    const assigneeId = t.assignee ? (userIds.get(t.assignee) as string) : null
    const task = await prisma.task.create({
      data: {
        projectId,
        kind: t.kind,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: i === 1 ? 'HIGH' : 'MEDIUM',
        reporterId: ownerId,
        assigneeId,
        dueAt: shift(t.dueDays * DAY_MS),
        closedAt: t.status === 'CLOSED' ? shift(-4 * DAY_MS) : null,
        kanbanOrder: i,
      },
    })
    const tagId = tags.get(i === 3 ? 'blocker' : 'rilis')
    if (tagId) await prisma.taskTag.create({ data: { taskId: task.id, tagId } })
    for (const [j, title] of (t.checklist ?? []).entries()) {
      await prisma.taskChecklistItem.create({ data: { taskId: task.id, title, done: j === 0, order: j } })
    }
    if (t.comment) {
      await prisma.taskComment.create({
        data: { taskId: task.id, authorId: assigneeId ?? ownerId, authorTag: 'MEMBER', body: t.comment },
      })
    }
  }
}

// ── seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const graceDays = await getLockGraceDays()
  if (escalateAfterDays(graceDays) >= graceDays) {
    console.error(
      `✗  Setting project.lockGraceDays = ${graceDays} terlalu kecil: stage ESCALATED dan LOCKED tidak bisa dibedakan.\n` +
        '   Naikkan ke minimal 2 (MCP: project_lock_set_grace) lalu jalankan ulang.',
    )
    process.exit(1)
  }

  console.log(`▶  Database: ${dbName()} · project.lockGraceDays = ${graceDays}\n`)
  const userIds = await ensureUsers()

  const seeded: { p: DemoProject; id: string }[] = []
  for (const p of DEMO_PROJECTS) {
    const id = await ensureHealthyProject(p, userIds.get('owner') as string)
    await resetChildren(id)
    await seedChildren(id, userIds)
    // Terakhir, baru dituakan: guard melihat baris yang masih sehat, jadi lolos.
    const endsAt = shift(endsAtOffsetMs(p.stage, graceDays))
    await prisma.project.update({ where: { id }, data: { endsAt, originalEndAt: endsAt } })
    seeded.push({ p, id })
    console.log(`▶  ${p.name} → endsAt ${endsAt.toISOString().slice(0, 16).replace('T', ' ')}`)
  }

  const ok = await verify(seeded, graceDays)
  printGuide(graceDays)
  return ok
}

/**
 * Satu-satunya pemeriksaan runnable script ini: baca ulang tiap project dan
 * bandingkan stage yang diharapkan dengan hasil `computeLockState` sungguhan.
 * Kalau aritmetika tanggalnya salah, baris ini yang gagal, bukan manusia yang
 * bingung di browser.
 */
async function verify(seeded: { p: DemoProject; id: string }[], graceDays: number): Promise<boolean> {
  console.log(`\n── Verifikasi stage (grace ${graceDays} hari) ──`)
  console.log(`${'PROJECT'.padEnd(36)}${'DIHARAPKAN'.padEnd(12)}${'AKTUAL'.padEnd(12)}HASIL`)
  let ok = true
  for (const s of seeded) {
    const row = await prisma.project.findUnique({
      where: { id: s.id },
      select: { endsAt: true, status: true, archivedAt: true },
    })
    const actual = row ? computeLockState(row, graceDays, now()).stage : 'TIDAK ADA'
    const match = actual === s.p.stage
    if (!match) ok = false
    console.log(`${s.p.name.padEnd(36)}${s.p.stage.padEnd(12)}${actual.padEnd(12)}${match ? 'OK' : 'TIDAK COCOK'}`)
  }
  console.log(ok ? '✓  Semua stage sesuai harapan.' : '✗  Ada stage yang tidak sesuai — fixture tidak bisa dipercaya.')
  return ok
}

function printGuide(graceDays: number) {
  const pw = DEMO_PASSWORD
  console.log(`
── Cara menelusuri di browser (http://localhost:${process.env.PORT ?? 3008}) ──
Password semua user fixture: ${pw}   (khusus test, bukan kredensial nyata)

1. Login sebagai ${DEMO_USERS[1]?.email} (OWNER).
   • Buka Proyek → lima project "${MARKER}" berurutan dari sehat ke terkunci.
   • Bandingkan tiga rung merah berdampingan: OVERDUE → ESCALATED → LOCKED.
   • Buka "${MARKER} 1 Sehat" untuk memastikan tidak ada rembesan warna merah.
   • Buka "${MARKER} 5 Terkunci": muncul layar keputusan — perpanjang deadline,
     atau tandai COMPLETED / CANCELLED. Coba juga tab-tab di project OVERDUE:
     masih bisa ditulis walau sudah merah.
2. Logout, login sebagai ${DEMO_USERS[3]?.email} (MEMBER).
   • "${MARKER} 5 Terkunci" → ditolak, ada tombol "Minta keputusan". Klik sekali:
     notifikasi terkirim ke owner/PM/admin; klik kedua dalam 12 jam → deduped.
   • Project lain tetap normal — bukti lock-nya per project, bukan per user.
3. Login sebagai ${DEMO_USERS[2]?.email} (PM).
   • Di project sehat PM masih berwenang penuh; di "${MARKER} 5 Terkunci" tetap
     403 — PM sengaja di luar carve-out keputusan.
4. Login sebagai ${DEMO_USERS[0]?.email} (system admin).
   • Semua project terbuka, termasuk yang terkunci, dan masih bisa ditulis.
5. Opsional ${DEMO_USERS[4]?.email} (VIEWER) untuk membandingkan read-only biasa
   dengan read-only akibat lock.

Masa tenggang sekarang ${graceDays} hari. Kalau diubah (Setting atau MCP
project_lock_set_grace), jalankan ulang script ini supaya stage fixture ikut.
`)
}

// ── cleanup ──────────────────────────────────────────────────────────────────

/**
 * Hapus tepat apa yang script ini buat. Butuh `withLockBypass`: project stage
 * LOCKED masih terkunci saat dihapus, dan `task.deleteMany` dkk. termasuk model
 * yang dijaga guard.
 */
async function cleanup() {
  await withLockBypass(async () => {
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: MARKER } },
      select: { id: true, name: true },
    })
    for (const p of projects) {
      await resetChildren(p.id)
      await prisma.project.delete({ where: { id: p.id } })
      console.log(`▶  Hapus project ${p.name}`)
    }
    const emails = DEMO_USERS.map((u) => u.email)
    // Notifikasi yang dikirim sweep ke user fixture ikut terhapus lewat cascade
    // recipient; yang ber-actorId fixture hanya di-SetNull, jadi tak ada sisa FK.
    const users = await prisma.user.deleteMany({ where: { email: { in: emails } } })
    console.log(`▶  Hapus ${users.count} user fixture`)
    console.log(`✓  Cleanup selesai — hanya baris ber-prefix ${MARKER} yang dihapus.`)
  })
}

function dbName(): string {
  try {
    // Hanya nama database; URL-nya (berisi kredensial) tidak pernah dicetak.
    return new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '') || '(tidak diketahui)'
  } catch {
    return '(tidak diketahui)'
  }
}

const mode = process.argv.includes('--cleanup') ? 'cleanup' : 'seed'

try {
  if (mode === 'cleanup') {
    await cleanup()
  } else if (!(await seed())) {
    process.exit(1)
  }
} catch (e) {
  console.error('✗  Gagal:', e instanceof Error ? e.message : e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
