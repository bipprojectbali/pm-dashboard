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

Forcing function, bukan penalti: project `ACTIVE` non-archived dengan `endsAt` yang lewat tanpa keputusan ditutup, supaya yang berwenang terpaksa memutuskan — perpanjang deadline, tandai `COMPLETED`, atau `CANCELLED`. Tulis dibekukan untuk semua anggota, dan **baca juga ditolak** — kunci yang masih membiarkan isi project terbaca cuma kosmetik, karena task/anggota/milestone yang hendak dibekukan tetap bisa diambil lewat route sub-resource.

- `src/lib/project-lock.ts` — state turunan, tidak ada kolom lock tersimpan. `computeLockState(project, graceDays, now?)` → stage `EXEMPT | ON_TIME | DUE_SOON | OVERDUE | ESCALATED | LOCKED`. Grace dari setting `project.lockGraceDays` (default 7, cache 60s); `DUE_SOON` 7 hari sebelum deadline; `ESCALATED` pada `ceil(grace/2)` hari terlambat; `LOCKED` pada `grace` hari terlambat.
- Penegakan tulis: `requireProjectMember` menurunkan role tiap anggota jadi `VIEWER` saat locked, `resolveAgentAuth` menurunkan scope token jadi `READ`. System admin tidak terkena. `requireProjectMemberRaw` memakai role asli — untuk jalur yang harus tetap hidup saat locked (extend deadline, baca access token, request-decision) **dan untuk membedakan OWNER/PM dari anggota biasa di `canReadProject`**: lewat `requireProjectMember` keduanya sama-sama terlihat `VIEWER`, sehingga carve-out keputusan ikut tertelan penolakan.
- Penegakan baca: `canReadProject(projectId, auth, opts)` (`src/lib/project-access.ts`) adalah satu-satunya gate baca project dan semua yang di bawahnya. Balikan `{ ok, status, membership, lock, rawRole, lockedView, project }` — `membership` tetap role efektif (turun `VIEWER` saat locked) supaya caller yang role-check tidak berubah perilaku; `rawRole`/`lock`/`lockedView`/`project` additive. Saat locked: system admin lolos penuh; OWNER/PM lolos **hanya** bila caller mengirim `{ allowLockedDecider: true }`, dan wajib menghormati `lockedView` dengan menyajikan payload minimal; sisanya 403. Project tidak ada → 404. Tanpa lock, perilakunya sama seperti sebelumnya (anggota, atau visibility `INTERNAL`/`PUBLIC`).
- `GET /api/projects/:id` satu-satunya pemakai `allowLockedDecider`. Saat `lockedView`, balikannya payload minimal: `{ project: { id, name, status, startsAt, endsAt }, myRole: <role asli>, canWrite: false, canDecide: true, lock, lockedView: true }` — tanpa task, anggota, milestone, fase, metrik, atau data GitHub. `startsAt` ikut dikirim karena modal perpanjang deadline memvalidasi terhadapnya. Route lain (`/phases`, `/tags`, `/milestones`, `/extensions`, `/retro`, `/github/*`, `GET /api/tasks?projectId=`, `dashboard-stats`, `dashboard-charts`, `GET /api/tasks/:id`, `GET /api/evidence/:file`) memakai `canReadProject` tanpa opsi, jadi 403 untuk semua non-admin saat locked.
- Frontend: `ProjectDetailView` tidak punya lagi escape hatch "lihat hanya baca" (dulu client-side, datanya tetap dikirim server). 403 ber-`{ locked: true }` dirender sebagai `ProjectLockedDenied` (penjelasan + tombol "Minta keputusan"); `lockedView` merender `ProjectLockedScreen` sendirian tanpa header/tab karena payload minimal tidak punya field yang mereka pakai; query detail memakai `retry: false`.
- `src/lib/project-lock.sweep.ts` — `runProjectLockSweep(now?)`, jalan saat startup lalu tiap jam dari `src/index.tsx`. Kind per stage: `PROJECT_DUE_SOON` / `PROJECT_OVERDUE` → owner + member OWNER/PM; `PROJECT_LOCK_WARNING` → ditambah semua system admin non-blocked; `PROJECT_LOCKED` → semua anggota + owner + system admin. Dedup per (penerima, project, kind) dalam 24 jam.
- `POST /api/projects/:id/request-decision` (`src/routes/projects/lock.route.ts`) — tombol anggota yang terblokir. Wajib anggota (role asli) atau system admin; 400 bila project belum locked; kirim `PROJECT_DECISION_REQUESTED` ke owner + OWNER/PM + system admin dengan `actorId` = caller; dedup per caller+project dalam 12 jam (`{ ok: true, deduped: true, notified: 0 }`); audit action `PROJECT_DECISION_REQUESTED`.
- Saat locked, `PATCH /api/projects/:id` hanya menerima body yang *satu-satunya* key-nya `status` bernilai `COMPLETED`/`CANCELLED` (jalur disposisi OWNER/PM); field lain — termasuk yang diselipkan bersama `status` — ditolak 403 `{ locked: true }`.
- `GET /api/projects` dan `GET /api/projects/:id` mengembalikan `lock` (LockState) plus `canWrite` (false saat locked kecuali system admin) dan, khusus detail, `canDecide` (OWNER/PM/system admin — sengaja tidak terpengaruh lock supaya layar kunci tahu siapa yang bisa memutuskan). `myRole` selalu role asli, bukan hasil downgrade. `GET /api/projects` sengaja **tidak** menyembunyikan project terkunci: anggota harus tahu project-nya ada dan sedang terkunci, bukan merasa terhapus.
- MCP: `project_lock_states` (readonly — inspeksi stage tanpa mengirim notifikasi), `project_lock_read_access` (readonly — untuk satu project+user: stage lock, `rawRole`, role efektif, `projectDetailRead` `FULL`/`LOCK_SCREEN`/`DENIED_*`, dan `subResourceRead`; memanggil `canReadProject` yang sama dengan API supaya tidak bisa melenceng dari behavior asli), `project_lock_sweep` (admin — jalankan sweep sekali), `project_lock_set_grace` (admin — ubah `project.lockGraceDays`, balikan: project yang langsung terkunci).

## Otorisasi event

Menautkan event ke sebuah project adalah aksi tulis pada project itu, bukan sekadar aksi pada event. `src/routes/events/write.route.ts` menegakkannya lewat `checkProjectWritable(projectId, auth)`: project tidak ada → 400; system admin lolos; selain itu wajib `requireProjectMember` dengan role selain `VIEWER`, kalau tidak 403.

- `POST /api/events` — `requireAuth` saja untuk event tanpa `projectId` (bebas dibuat user login). Begitu `projectId` diisi, `checkProjectWritable` berlaku.
- `PATCH /api/events/:id` — creator-or-system-admin tetap gate pertama (403). Lalu write-access diperiksa pada project **asal** bila event sudah melekat ke project, dan pada project **tujuan** bila `projectId` diubah; keduanya harus lolos, jadi event tidak bisa dipindahkan keluar/masuk project yang tidak boleh ditulis caller.
- `DELETE /api/events/:id` — tidak berubah: creator-or-system-admin.
- Overdue lock ikut tertutup tanpa kode tambahan: `requireProjectMember` melaporkan anggota project terkunci sebagai `VIEWER`, sehingga gate "bukan VIEWER" otomatis menolak.
- MCP `event_create`/`event_update` menulis langsung ke prisma tanpa cek keanggotaan — ini disengaja dan setara system admin: modul `eventsTools` hanya terdaftar pada scope `admin`, dan `NODE_ENV=production` memaksa scope `readonly` saat registrasi. Tool event tidak ada di whitelist `token-scoped-server.ts` (task saja), jadi token project tidak bisa menyentuh event.

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

