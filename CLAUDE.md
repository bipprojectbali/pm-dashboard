Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Top-level layout

- `src/app.ts` — Elysia factory with all HTTP routes (testable via `app.handle()`)
- `src/index.tsx` — server entry (Vite middleware in dev, static serving in prod, `.listen()`)
- `src/serve.ts` — dev entry (`bun --watch src/serve.ts`)
- `src/frontend/` — React 19 + Vite 8 + TanStack Router (routes, components, hooks)
- `src/lib/` — single-purpose helpers: `db` (Prisma client), `redis`, `applog`, `presence`, `github`, `github-summary`, `self-project`, `admin-overview`, `effort`, `retro`, `chat`, `chat-documents`, `extensions`, `task-metrics` (`WORKLOAD_KIND_FILTER` — excludes `IDEA` kind from workload aggregations), `project-access-tokens` (generate/hash/verify per-project bearer token for agents), `agent-auth` (`resolveAgentAuth`/`resolveReporterId`/`canWrite` for the token-only `/api/agent/*` REST surface), `llms-content` (`renderLlmsTxt` — auth-gated `GET /api/agent/guide` agent guide), `evidence-storage` (`putEvidence`/`getEvidence`/`removeEvidence` — MinIO/S3 object storage for evidence files via `Bun.S3Client`)
- `prisma/` — `schema.prisma` + single baseline migration + `seed.ts` (dev only)
- `scripts/mcp/` — local stdio MCP; `scripts/mcp-deploy/` — deploy wrapper
- `tests/unit/`, `tests/integration/` — `bun:test`

## Commands

- DB: `bun run db:migrate`, `bun run db:seed`, `bun run db:generate`
- Test: `bun run test`, `bun run test:unit`, `bun run test:integration`

## Overdue project lock

Forcing function, bukan penalti: project `ACTIVE` non-archived dengan `endsAt` yang lewat tanpa keputusan jadi read-only, supaya yang berwenang terpaksa memutuskan — perpanjang deadline, tandai `COMPLETED`, atau `CANCELLED`.

- `src/lib/project-lock.ts` — state turunan, tidak ada kolom lock tersimpan. `computeLockState(project, graceDays, now?)` → stage `EXEMPT | ON_TIME | DUE_SOON | OVERDUE | ESCALATED | LOCKED`. Grace dari setting `project.lockGraceDays` (default 7, cache 60s); `DUE_SOON` 7 hari sebelum deadline; `ESCALATED` pada `ceil(grace/2)` hari terlambat; `LOCKED` pada `grace` hari terlambat.
- Penegakan: `requireProjectMember` menurunkan role tiap anggota jadi `VIEWER` saat locked, `resolveAgentAuth` menurunkan scope token jadi `READ`. System admin tidak terkena. `requireProjectMemberRaw` memakai role asli — untuk jalur yang harus tetap hidup saat locked (extend deadline, baca access token, request-decision).
- `src/lib/project-lock.sweep.ts` — `runProjectLockSweep(now?)`, jalan saat startup lalu tiap jam dari `src/index.tsx`. Kind per stage: `PROJECT_DUE_SOON` / `PROJECT_OVERDUE` → owner + member OWNER/PM; `PROJECT_LOCK_WARNING` → ditambah semua system admin non-blocked; `PROJECT_LOCKED` → semua anggota + owner + system admin. Dedup per (penerima, project, kind) dalam 24 jam.
- `POST /api/projects/:id/request-decision` (`src/routes/projects/lock.route.ts`) — tombol anggota yang terblokir. Wajib anggota (role asli) atau system admin; 400 bila project belum locked; kirim `PROJECT_DECISION_REQUESTED` ke owner + OWNER/PM + system admin dengan `actorId` = caller; dedup per caller+project dalam 12 jam (`{ ok: true, deduped: true, notified: 0 }`); audit action `PROJECT_DECISION_REQUESTED`.
- Saat locked, `PATCH /api/projects/:id` hanya menerima body yang *satu-satunya* key-nya `status` bernilai `COMPLETED`/`CANCELLED` (jalur disposisi OWNER/PM); field lain — termasuk yang diselipkan bersama `status` — ditolak 403 `{ locked: true }`.
- `GET /api/projects` dan `GET /api/projects/:id` mengembalikan `lock` (LockState) plus `canWrite` (false saat locked kecuali system admin) dan, khusus detail, `canDecide` (OWNER/PM/system admin — sengaja tidak terpengaruh lock supaya layar kunci tahu siapa yang bisa memutuskan). `myRole` selalu role asli, bukan hasil downgrade.
- MCP: `project_lock_states` (readonly — inspeksi stage tanpa mengirim notifikasi), `project_lock_sweep` (admin — jalankan sweep sekali), `project_lock_set_grace` (admin — ubah `project.lockGraceDays`, balikan: project yang langsung terkunci).

## Otorisasi event

Menautkan event ke sebuah project adalah aksi tulis pada project itu, bukan sekadar aksi pada event. `src/routes/events/write.route.ts` menegakkannya lewat `checkProjectWritable(projectId, auth)`: project tidak ada → 400; system admin lolos; selain itu wajib `requireProjectMember` dengan role selain `VIEWER`, kalau tidak 403.

- `POST /api/events` — `requireAuth` saja untuk event tanpa `projectId` (bebas dibuat user login). Begitu `projectId` diisi, `checkProjectWritable` berlaku.
- `PATCH /api/events/:id` — creator-or-system-admin tetap gate pertama (403). Lalu write-access diperiksa pada project **asal** bila event sudah melekat ke project, dan pada project **tujuan** bila `projectId` diubah; keduanya harus lolos, jadi event tidak bisa dipindahkan keluar/masuk project yang tidak boleh ditulis caller.
- `DELETE /api/events/:id` — tidak berubah: creator-or-system-admin.
- Overdue lock ikut tertutup tanpa kode tambahan: `requireProjectMember` melaporkan anggota project terkunci sebagai `VIEWER`, sehingga gate "bukan VIEWER" otomatis menolak.
- MCP `event_create`/`event_update` menulis langsung ke prisma tanpa cek keanggotaan — ini disengaja dan setara system admin: modul `eventsTools` hanya terdaftar pada scope `admin`, dan `NODE_ENV=production` memaksa scope `readonly` saat registrasi. Tool event tidak ada di whitelist `token-scoped-server.ts` (task saja), jadi token project tidak bisa menyentuh event.

## Otorisasi batch reorder task

`POST /api/tasks/reorder` (`src/routes/tasks/bulk.route.ts`) menulis ke **semua** `updates[].id`, jadi otorisasinya juga per batch, bukan per task pertama. Satu query `task.findMany` me-resolve seluruh id → id yang tidak ada/soft-deleted menghasilkan 404; lalu tiap `projectId` **distinct** yang tersentuh wajib lolos `requireProjectMember` + `meetsMinProjectRole('permissions.task.write.minProjectRole')` (system admin bypass). Satu project gagal → 403 untuk seluruh request, tanpa tulisan parsial (entri yang tidak sah tidak boleh di-drop diam-diam karena itu menyembunyikan percobaan serangan). Overdue lock ikut tertutup otomatis lewat downgrade `VIEWER` dari `requireProjectMember`.

MCP: `task_reorder_authz_check` (readonly) — dari daftar taskId, laporkan project yang tersentuh, role efektif user, dan status yang diharapkan (200/403/404).

## Integritas batch reorder task

Satu drag di board Kanban adalah **satu** gesture user yang menulis ke banyak baris, jadi batch-nya atomic dan divalidasi utuh sebelum menulis. Keduanya tinggal di `applyReorderBatch` (`src/routes/tasks/reorder.helpers.ts`); route `bulk.route.ts` hanya memanggilnya setelah gate otorisasi di atas lolos.

- **Atomic.** Seluruh `task.update` **plus** baris `TaskStatusChange`-nya masuk satu `prisma.$transaction` (bentuk array, pola yang sama dipakai `POST /api/tasks/bulk`). Sebelumnya `Promise.all` dari update independen — bukan transaksi — sehingga gagal di tengah batch menyisakan board separuh ter-reorder: `kanbanOrder` bertabrakan/berlubang dan sebagian task berpindah status sementara saudaranya tidak, padahal user melihat request gagal. Riwayat status ikut masuk transaksi supaya state task dan jejaknya tidak pernah berbeda.
- **Notifikasi di luar transaksi, setelah commit.** Sengaja dua arah: memanggilnya di dalam transaksi akan mengumumkan perubahan status yang bisa di-rollback sesudahnya, sementara `notifyTaskStatusChanged` melakukan I/O jaringan (Telegram) yang tidak boleh menahan transaksi DB tetap terbuka. Dispatch-nya di-await (supaya baris notifikasi sudah ada saat response balik) tapi tiap kegagalan ditelan — Telegram mati tidak boleh menggagalkan drag.
- **Validasi status pakai state machine yang sama.** Tiap baris yang membawa `status` dilewatkan ke `getAllowedTaskTransitions` (`src/lib/task-lifecycle.ts`) — persis yang dipakai `PATCH /api/tasks/:id` — jadi tidak ada sumber kebenaran kedua soal transisi legal. Sebelumnya `buildReorderUpdateData` menulis string `status` apa pun dari klien, sehingga menjatuhkan kartu di kolom yang salah bisa melewati gate QC sebuah kind. Transisi ilegal → **400** dengan pesan Indonesia yang menyebut task dan transisi yang ditolak.
- **All-or-nothing, termasuk untuk baris ilegal.** Satu baris ilegal membatalkan seluruh batch, tidak hanya baris itu: `kanbanOrder` yang dihitung frontend mengasumsikan semua baris mendarat, dan menerapkan sebagian justru menghasilkan board separuh berubah yang transaksi di atas ada untuk mencegah.
- **Baris no-op.** `status` yang sama dengan status sekarang (atau baris tanpa `status`, yaitu reorder murni dalam satu kolom) dihitung bukan transisi: state machine tidak punya edge X → X, tapi klien yang mengirim ulang status sekarang bukan sedang meminta perpindahan ilegal. Baris seperti ini lolos tanpa menulis `TaskStatusChange` maupun notifikasi.
- Catatan: extension prisma di `src/lib/prisma-soft-delete.ts` hanya menyuntik `deletedAt: null` ke operasi **baca** model Task — jalur tulis tidak pernah lewat situ, jadi transaksi ini tidak melewati guard apa pun. Overdue lock tetap ditegakkan di lapisan route lewat `requireProjectMember`, sebelum `applyReorderBatch` dipanggil.

MCP: `task_reorder_transition_check` (readonly) — dari daftar `{ id, status }`, laporkan status & kind task sekarang, transisi yang diizinkan, baris ilegal pertama, dan status yang diharapkan (200/400/404). Tidak menulis apa pun.

## Aturan penambahan fitur (WAJIB)

Setiap fitur baru — endpoint API, route frontend, lib helper, integrasi, behavior cron, dsb. — harus selalu disertai **dua hal** sebelum dianggap selesai:

1. **Test** di `tests/unit/` (untuk lib/helper murni) dan/atau `tests/integration/` (untuk endpoint via `app.handle()`). Minimal cover golden path + 1 edge case + 1 failure case. Gunakan helper di `tests/helpers.ts` (`createTestApp`, `seedTestUser`, `cleanupTestData`). Tidak boleh mock DB — tes integrasi harus hit Postgres asli.
2. **MCP tool** di `scripts/mcp/tools/` yang membungkus fitur tersebut sehingga bisa dipakai dari dev (stdio, full admin scope) DAN stg (HTTP, readonly otomatis karena `NODE_ENV=production` gate). Tool readonly daftarkan di module `*Readonly`, tool write di module utama. Tujuannya: setiap fitur bisa diinspeksi/dijalankan tanpa harus login UI baik di dev maupun stg.

Pengecualian: perubahan kosmetik murni (rename label UI, tweak styling, copy-edit dokumentasi) tidak butuh test + MCP tool. Bila ragu apakah perubahan termasuk "fitur" — anggap iya, buat keduanya.

Saat menyelesaikan fitur tanpa test atau tanpa MCP tool, jelaskan secara eksplisit ke user kenapa dan minta konfirmasi sebelum dianggap done.

## Aturan update CLAUDE.md (WAJIB)

Setiap kali menyentuh **business logic** — definisi: perubahan yang mengubah behavior runtime, bukan hanya tampilan atau struktur file — CLAUDE.md harus diperbarui **dalam PR/commit yang sama**, bukan sebagai follow-up terpisah.

Yang termasuk business logic dan wajib diikuti update docs:
- Alur autentikasi, otorisasi, atau role-check
- Kalkulasi atau agregasi data (effort, health score, retro, overview)
- Cron / scheduler / background job (kondisi trigger, TZ, cooldown, dedup)
- Integrasi eksternal (Telegram, GitHub webhook, Claude API, pm-watch)
- State machine (task status transition, agent status, token lifecycle)
- Aturan validasi atau constraint bisnis (batas batch, retention, scope MCP)
- Setting yang mengubah behavior server (`report.timezone`, `telegram.enabled`, dsb.)

Yang **tidak** termasuk dan tidak perlu update CLAUDE.md:
- Rename variable / refactor tanpa perubahan behavior
- Tweak styling, label UI, copy-edit teks
- Penambahan test atau MCP tool untuk fitur yang sudah terdokumentasi

Cara update: perbarui bagian yang relevan di `CLAUDE.md`. Jika tidak ada seksi yang pas, tambahkan seksi baru.

