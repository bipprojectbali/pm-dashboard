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
- Penegakan lapis 1 (route): `requireProjectMember` menurunkan role tiap anggota jadi `VIEWER` saat locked, `resolveAgentAuth` menurunkan scope token jadi `READ`. System admin tidak terkena. `requireProjectMemberRaw` memakai role asli — untuk jalur yang harus tetap hidup saat locked (extend deadline, baca access token, request-decision).
- Penegakan lapis 2 (data): `src/lib/prisma-project-lock.ts` — query extension `withProjectLock`, dikomposisi di `src/lib/db.ts` sebagai `withProjectLock(withSoftDelete(base), base)`. Lapis 1 hanya menutup jalur yang memeriksa keanggotaan; jalur yang memeriksa hal lain (identitas reporter di task trash, role global di QC, scope token di `/mcp`) dulu lolos. Lapis 2 memindahkan invariannya ke klien: tiap **write** pada model milik project meresolve project pemiliknya dan melempar `ProjectLockedError` bila locked — `src/app.ts` `onError` memetakannya ke 403 `{ locked: true, projectId }`, bentuk yang sama dengan jalur route. Route/helper/cron/MCP tool baru otomatis tercakup, dan arah kegagalannya terbalik: lupa guard = penolakan yang terlihat, bukan penulisan diam-diam yang lolos.
  - Dijaga: `project` (hanya `update*`/`upsert` — `create` belum punya project, `delete` sengaja dibiarkan supaya project terkunci tidak jadi perangkap); ber-`projectId` sendiri (`task`, `tag`, `event`, `projectMember`, `projectMilestone`, `projectPhase`, `projectExtension`); lewat task induk (`taskComment`, `taskEvidence`, `taskChecklistItem`, `taskStatusChange`, `taskTag`, `taskDependency`); lewat baris induk (`milestoneTag`, `phaseTag`).
  - Sengaja TIDAK dijaga: `notification` (sweep & request-decision justru memberi tahu *tentang* project terkunci), `projectAccessToken` (`lastUsedAt` distempel tiap request agent), `projectGithubEvent` + `githubWebhookLog` (data webhook tak bisa di-fetch ulang), `chatDocument`, dan semua model global. **Read tidak pernah disentuh** — agregasi lintas project di `admin-overview`/`retro`/`effort`/`task-metrics`/`chat` harus tetap melihat data terkunci.
  - Keterbatasan (sama seperti extension soft-delete): nested write (`project.update({ data: { tasks: { create } } })`), `$queryRaw`, dan `$executeRaw` tidak terlihat oleh guard.
- Dua pengecualian guard data, tidak ada yang lain:
  - **Actor system admin.** Query extension tidak bisa melihat pemanggil, jadi lapisan auth yang mencatatnya di `AsyncLocalStorage`: `beginLockActorScope()` dipanggil dari hook `onRequest` paling awal di `src/app.ts` (default bukan admin), lalu `recordLockActor(isSystemAdmin(role))` dari `requireAuth` dan `recordLockActor(false)` dari `resolveAgentAuth` — token project tidak pernah dapat pengecualian ini. Store memegang objek yang *dimutasi*, bukan `enterWith` baru: `requireAuth` baru tahu role setelah query DB, dan `enterWith` setelah `await` tidak terlihat oleh handler yang sedang menunggunya. **Gagal tertutup**: tanpa scope (cron, startup sweep, script, MCP stdio) `isSystemAdminActor()` = false, jadi pemanggil tak dikenal tidak pernah terbaca sebagai admin.
  - **`withLockBypass(fn)`** — scope eksplisit, grep-able, untuk write yang tidak boleh diblokir kunci. Lima tempat: `extensions.route.ts` (`/extend`, transaksi perpanjangan deadline), `projects/write.handlers.ts` (disposisi `status` → `COMPLETED`/`CANCELLED`; handler sudah memutuskan apa yang diterima, guard data tidak melihat actor), `projects/lock.route.ts` (notifikasi request-decision — ikat-tali-ganda, `notification` sendiri tidak dijaga), `admin/sync.route.ts` (wipe + import antar-environment), dan cron auto-purge trash di `src/index.tsx` (housekeeping retensi atas baris yang sudah di-trash user, bukan write project — tanpa bypass, project terkunci bisa menahan sampah selamanya). Test teardown (`tests/helpers.ts`) juga memakainya.
- `src/lib/project-lock.sweep.ts` — `runProjectLockSweep(now?)`, jalan saat startup lalu tiap jam dari `src/index.tsx`. Kind per stage: `PROJECT_DUE_SOON` / `PROJECT_OVERDUE` → owner + member OWNER/PM; `PROJECT_LOCK_WARNING` → ditambah semua system admin non-blocked; `PROJECT_LOCKED` → semua anggota + owner + system admin. Dedup per (penerima, project, kind) dalam 24 jam.
- `POST /api/projects/:id/request-decision` (`src/routes/projects/lock.route.ts`) — tombol anggota yang terblokir. Wajib anggota (role asli) atau system admin; 400 bila project belum locked; kirim `PROJECT_DECISION_REQUESTED` ke owner + OWNER/PM + system admin dengan `actorId` = caller; dedup per caller+project dalam 12 jam (`{ ok: true, deduped: true, notified: 0 }`); audit action `PROJECT_DECISION_REQUESTED`.
- Saat locked, `PATCH /api/projects/:id` hanya menerima body yang *satu-satunya* key-nya `status` bernilai `COMPLETED`/`CANCELLED` (jalur disposisi OWNER/PM); field lain — termasuk yang diselipkan bersama `status` — ditolak 403 `{ locked: true }`.
- `GET /api/projects` dan `GET /api/projects/:id` mengembalikan `lock` (LockState) plus `canWrite` (false saat locked kecuali system admin) dan, khusus detail, `canDecide` (OWNER/PM/system admin — sengaja tidak terpengaruh lock supaya layar kunci tahu siapa yang bisa memutuskan). `myRole` selalu role asli, bukan hasil downgrade.
- `/mcp` (`src/routes/mcp.route.ts`) memakai `resolveAgentAuth`, bukan `verifyProjectToken` langsung, supaya `/mcp` dan `/api/agent/*` menjawab sama untuk token yang sama: token WRITE di project locked hanya dapat toolset READ.
- MCP: `project_lock_states` (readonly — inspeksi stage tanpa mengirim notifikasi), `project_lock_write_guard` (readonly — daftar model+operasi yang dijaga, dan untuk `projectId`+`model`+`operation` apakah guard akan menolak; memakai `findLockedProject` yang sama dengan extension supaya tidak bisa beda jawaban), `project_lock_sweep` (admin — jalankan sweep sekali), `project_lock_set_grace` (admin — ubah `project.lockGraceDays`, balikan: project yang langsung terkunci).

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

