# Changelog

Semua perubahan penting pada pm-dashboard dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

---

## [Unreleased]

## [0.7.9] - 2026-06-15

### Ditambahkan
- **Milestone Tags** — m2m antara `ProjectMilestone` dan `Tag` via model `MilestoneTag`.
  - Schema: tabel `milestone_tag` (milestoneId, tagId, cascade delete on both sides), migration `20260615000000_add_milestone_tags`.
  - HTTP API: `GET /api/projects/:id/milestones` + `GET /api/milestones` kini include `tags[]`; `POST /api/projects/:id/milestones` dan `PATCH /api/milestones/:id` menerima `tagIds[]` (replace-set).
  - MCP: `milestone_list`, `milestone_create`, `milestone_update` include/manage tags.
  - Frontend: `MilestoneEditModal` dengan tag multi-select; badge tag di `MilestonesSection`.
  - Tests: `tests/integration/milestones.test.ts` — 19 test case (CRUD + tag replace + cascade delete).
- **Chat AI tool `query_effort`** — tool ke-5 yang melengkapi `CHAT_TOOLS`. Mode: `task` (detail estimasi vs aktual satu task), `user` (ringkasan open task per user), `overbudget` (task yang melebihi atau di bawah estimasi berdasarkan timeline closedAt−startsAt).
- **Runtime Permission Config** — konfigurasi role yang bisa buat project, dll. disimpan di `app_settings` dan bisa diubah tanpa redeploy.

### Diubah
- **File-health refactor (15 file)** — 15 file besar di-split menjadi sub-modul sesuai batas FILE-HEALTH.md:
  - `src/lib/admin-overview.ts` (547 baris) → `admin-overview/{kpis,health,load,risks,analytics,shared}.ts`
  - `src/lib/chat.ts` (453 baris) → `chat/{context,rag,stream,embedding,search,upsert,types,...}.ts`
  - `src/lib/chat-tools.ts` (532 baris) → `chat-tools/{schemas,types,users,tasks,projects,github,effort}.ts`
  - `src/lib/retro.ts` (353 baris) → `retro/{compute,render,types}.ts`
  - `src/lib/routes-metadata.ts` (553 baris) → `routes-metadata/{admin,auth,frontend,misc,projects,tasks,types,user}.ts`
  - Route handlers: `admin.route.ts`, `events.route.ts`, `me.route.ts`, `projects.route.ts`, `qc.route.ts`, `settings.route.ts`, `tasks.route.ts`, `webhooks.route.ts` masing-masing dipecah ke sub-direktori.
  - `src/frontend/routes/dev.tsx` (3521 baris) → 17 komponen di `src/frontend/components/dev/`.
- **Fix tasks role-check** — 3 gap kontrol akses di endpoint task diperbaiki berdasarkan audit permissions.

### Ditambahkan (sebelumnya di Unreleased)
- **Phase tabs + Phase assignment di Tasks** — baris pill interaktif filter fase, kolom fase di tabel, `phaseId` di create/update task.
- **Phase summary + Stepper + Template** — field `summary` saat menutup fase, tampilan Stepper vertikal, template 4 fase preset.

## [0.7.4] - 2026-06-12

### Ditambahkan
- **ProjectPhase — pengelompokan task ke dalam fase/sprint** — setiap project bisa punya beberapa fase dengan status (PLANNING / ACTIVE / COMPLETED), urutan, dan rentang tanggal opsional.
  - Schema: model `ProjectPhase` (id, projectId, title, description, status, order, startsAt, endsAt, timestamps) + enum `PhaseStatus`; kolom `phaseId` (nullable FK, `onDelete: SetNull`) di `Task`.
  - API: `GET /api/projects/:id/phases`, `GET /api/phases`, `POST /api/projects/:id/phases`, `PATCH /api/phases/:id`, `DELETE /api/phases/:id`. Endpoint write di-gate `canManageProject` (OWNER/PM/ADMIN/SUPER_ADMIN).
  - Task filter: `GET /api/tasks?phaseId=<id>` hanya task di fase tersebut; `phaseId=none` hanya task tanpa fase (backlog view).
  - Frontend: tab "Phases" di `ProjectDetailView` dengan badge jumlah; `PhasesSection.tsx` — daftar fase + form create/edit inline + delete dengan konfirmasi. Filter fase di `TasksPanel` (Select dropdown muncul jika project punya fase) dan di `TasksKanbanView`. Phase filter tersimpan di localStorage.
  - MCP: modul `phases.ts` — `phase_list` (readonly), `phase_create`, `phase_update`, `phase_delete` (admin). Terdaftar di `scripts/mcp/server.ts`.
  - Tests: `tests/integration/phases.test.ts` — 17 test case: list kosong, create (golden path + auto-order + VIEWER 403 + validation), update (title/status/tanggal + VIEWER 403 + 404), delete (SET NULL pada task + VIEWER 403 + 404), filter phaseId=X, filter phaseId=none.

## [0.7.3] - 2026-06-10

### Ditambahkan
- **Server-side pagination untuk Tasks, Audit Logs, dan Projects** — sebelumnya data di-fetch bulk (max 500 task) lalu di-slice di browser. Sekarang setiap request hanya mengambil satu halaman dari server.
  - `GET /api/tasks`: parameter `limit` (default 50, max 200), `offset`, `search`, `priority`, `overdueOnly`, `unassigned`, `noDue`, `blocked`. Response menyertakan `total` dari `count()` paralel.
  - `GET /api/admin/logs/audit`: parameter `since` (ISO 8601) dan `offset`; `total` dari `count()` paralel.
  - `GET /api/projects`: safeguard `take/skip` limit 200.
  - Kanban view: 5 `useQuery` terpisah per status (`OPEN`, `IN_PROGRESS`, `READY_FOR_QC`, `REOPENED`, `CLOSED`) dengan `colOffset` state dan invalidasi per-kolom saat drag-drop.
  - Audit Logs panel: `since=` dikirim ke API dari window filter (7d/30d/all), pagination dari `total` API.
  - Schema: 3 index baru pada tabel `task` — `(projectId, status)`, `(dueAt)`, `(priority)`.
- **Filter by member di Projects panel** — filter avatar dipindah ke baris terpisah di bawah toolbar (tidak lagi inline). Avatar 36px dengan gap=8, nama anggota aktif ditampilkan, overflow user dalam popover. Mode toggle avatar ↔ dropdown tersimpan di localStorage.
- **Tests**: `tests/integration/tasks-pagination.test.ts` — 15 test case: pagination, search, priority, quickFilter (overdueOnly, unassigned, noDue), total accuracy, auth.

### Diubah
- `useRealtimeInvalidate`: key `tasks-kanban` ditambahkan ke invalidasi realtime sehingga kanban per-kolom ter-refresh saat ada update task via WebSocket.

## [0.7.2] - 2026-06-08

### Diperbaiki
- **Delete task kini berfungsi** — modal input alasan tidak muncul karena menggunakan hook `useLocalState` yang tidak ada dan komponen modal didefinisikan di dalam fungsi biasa (bukan komponen React). Perbaikan: ekstrak `DeleteReasonModal` sebagai komponen level modul dan ganti ke `useState`.

### Diubah
- **Migration cleanup**: hapus index `chat_document_embedding_idx` (IVFFlat) dan `chat_document_trgm_idx` (trigram GIN) dari DB — keduanya sudah tidak didefinisikan di `schema.prisma` sehingga menyebabkan drift.

## [0.7.1] - 2026-06-07

### Diperbaiki
- **Tabel markdown di Chat AI dan Riwayat Laporan kini ter-render sebagai tabel HTML asli** — sebelumnya muncul sebagai teks markdown mentah (`| col | col |`) karena `react-markdown` default tidak mendukung GFM. Tambah plugin `remark-gfm@4.0.1` ke `<ReactMarkdown remarkPlugins={[remarkGfm]}>` di `AdminChatPanel.tsx` dan `ReportHistoryPanel.tsx`.
- **System prompt Chat AI** ditambah seksi "FORMAT MARKDOWN" yang mewajibkan AI menulis tabel GFM dengan newline per baris (header + separator + tiap row dipisah baris baru) agar render konsisten.

### Diubah
- **Format sweep menyeluruh (Biome)** — normalisasi trailing comma, line-wrap, sort import, dan beberapa unused-import cleanup di 41 file FE + BE. Tidak ada perubahan behavior runtime.

## [0.7.0] - 2026-06-05

### Ditambahkan
- **Extensions (GitHub & Chat AI sebagai opt-in)** — grup baru "Extensions" di sidebar `/dev` dengan dua sub-menu (GitHub Integration, Chat AI). Setiap extension punya toggle switch (default aktif). Helper `src/lib/extensions.ts` dengan cache 60s dan invalidation otomatis lewat `setSetting` hook. Setting key: `extensions.<name>.enabled`.
- **Gating 4-lapis** saat extension OFF:
  - **API**: `/api/admin/chat/stream` & `/api/admin/chat/sync` balas 503; `/webhooks/github` balas 200 `{ ok: true, skipped: true, reason: 'extension_disabled' }` (200 untuk pertahankan registrasi webhook — GitHub auto-disable setelah 100× kegagalan).
  - **Cron + startup**: `syncChatDocuments` dilewati saat boot maupun cron `*/10 * * * *`.
  - **Tool filtering**: `query_github_activity` di Chat AI tool list otomatis disembunyikan saat GitHub OFF; doc type `github_project` skip di sync.
  - **UI**: tab "Chat AI" di `/admin` disembunyikan; `GithubActivityCard` + `GithubIntegrationCard` di project detail disembunyikan. Hook FE `useIsExtensionEnabled` default `true` saat loading agar tidak flicker.
- **Endpoint baru**:
  - `GET /api/admin/extensions` (ADMIN+SUPER_ADMIN) — list extension + status.
  - `PUT /api/admin/extensions/:name` (ADMIN+SUPER_ADMIN) — toggle, tulis audit log `EXTENSION_TOGGLED`.
  - `GET /api/extensions/status` (semua user authed) — status untuk UI gating.
- **MCP tools**: `extension_list` (readonly), `extension_toggle` (admin, optional `actorEmail` → audit log).
- **Audit log action baru**: `EXTENSION_TOGGLED` dengan detail `{ name, enabled, source }`.
- **Data preservation**: toggle OFF tidak menghapus data — `chat_document` dan `ProjectGithubEvent` rows tetap.
- **Chat AI Tool-Calling (5 read-only tools)** — Anthropic native tool_use loop di `streamChatSSE` (max 5 iterasi). Tools: `query_users`, `query_tasks` (mode list/aggregate dengan `groupBy: status|priority|kind|assignee|project`), `query_project_detail`, `query_github_activity` (project-scoped / actor-scoped / global), `query_effort` (mode user/task/overbudget). Hasil di-cap 50 row dengan flag `truncated`. Validasi runtime via Zod. Tools wajib dipakai untuk pertanyaan numerik/agregat — system prompt menginstruksikan AI agar tidak menebak dari snapshot.
- **SSE events baru** `tool_use` (id, name, input) + `tool_result` (id, ok, result) — FE render `ToolCallCard` collapsible dengan badge status (pending/error/empty/N rows) dan section "DIVERIFIKASI DARI N TOOL CALL" di atas konten assistant. Tool call ter-persist di history.
- **Chat AI Knowledge Base full-coverage** — RAG (`chat_document` table) diperluas dari 5 doc types (user/task/project/event/comment) ke 17, mencakup: `github_project` (commit/PR per repo), `effort_user` (phantom work 7h), `effort_task` (over/underbudget), `ghost_task` (stale IN_PROGRESS), `milestone`, `extension`, `dependency` (blocker chain), `evidence`, `audit_recent` (role/block 30h), `agent_status`, `report_history`, `project_retro` (14h, full-sync only). Chat sekarang bisa menjawab "siapa commit terbanyak", "task mana overbudget", "milestone X kapan", dll.
- **Citation `[#n]`** — assistant bubble menampilkan footer "SUMBER" berisi badge tiap dokumen rujukan (type + title) dengan tooltip; SSE event baru `sources` dikirim sebelum token pertama, di-replay di `done`.
- **Live context tambahan** di system prompt: section AKTIVITAS GITHUB 7H, EFFORT 7H, AGENT STATUS.
- **Badge "Konteks {age}"** + tombol **"Refresh Konteks"** — kosongkan systemContext tanpa hapus history (untuk segarkan KPI/roster live tanpa kehilangan percakapan).
- **MCP tools chat**: `chat_doc_search` (readonly — pgvector + FTS + trigram dengan optional `type` filter), `chat_doc_stats` (readonly — total + breakdown + lastSync), `chat_sync_run` (admin — full/incremental, return synced/pruned/failedEmbeddings).
- **Helper `src/lib/github-summary.ts`** — extracted dari `projects.route.ts` agar dipakai bersama oleh API & sync.
- **Orphan prune** di full-sync — bersihkan dokumen yang sumbernya sudah hilang/archived/expired per-type. Return `pruned` count di response sync.
- **Embedding cache invalidation** — `setSetting('embedding.*')` otomatis panggil `invalidateEmbeddingCache()` sehingga perubahan API key/model langsung berlaku tanpa restart.
- Migration baru `chat_document_metadata` — kolom `projectId` opsional + index `(projectId)` & `(type, syncedAt)`.

### Diperbaiki
- **Members tim** di live context kini terisi (sebelumnya hilang karena `computeProjectHealth` tidak include members) — dengan query terpisah `prisma.projectMember.findMany`.
- **Semantic search threshold** — cosine `> 0.35` minimum, plus fallback ke FTS kalau hits < 3. Sebelumnya dokumen tidak relevan tetap muncul di context.
- **MCP module count** di docs diperbarui (22 modules, 110 tools).

---

## [0.6.3] - 2026-06-05

### Ditambahkan
- **Chat AI** — tab baru di /admin (grup "AI"): chat multi-turn dengan Claude menggunakan konteks DB real-time (proyek, task, tim, risiko, events). Konteks dibangun sekali per sesi (Opsi B), follow-up pertanyaan hemat token. Quick prompts 5 preset, streaming live dengan animasi titik-titik berdenyut, markdown rendering, copy per pesan, sesi baru untuk refresh konteks
- **Indikator "AI sedang berpikir"** — bubble typing dots (`Loader type="dots"`) muncul segera saat AI sedang memproses, sebelum token pertama muncul
- **Riwayat Laporan (DB)** — penyimpanan beralih dari Redis ke PostgreSQL untuk analisa historis. API pagination + filter range (1 bulan/3 bulan/semua). Preview rendered vs markdown. Delete per-entri (SUPER_ADMIN, tersedia di /dev)

### Diubah
- `sendMessage` di admin sekarang multi-turn dengan history conversation

---

## [0.6.2] - 2026-06-05

### Ditambahkan
- **Riwayat Laporan di Admin** — menu baru "Riwayat Laporan" di sidebar /admin (grup Sistem); klik baris untuk preview konten laporan via Drawer
- **Preview konten laporan** — laporan yang dikirim kini menyimpan markdown-nya di Redis history; klik baris atau ikon mata untuk melihat isi laporan, lengkap dengan tombol Copy

### Diubah
- Deskripsi riwayat pengiriman diperbarui: "klik baris untuk preview konten laporan"

---

## [0.6.1] - 2026-06-04

### Ditambahkan
- **File Health** — tab baru di /dev Konsol menampilkan ukuran setiap file vs batas FILE_HEALTH.md; status OK/Warning/Over dengan progress bar, filter, pagination Mantine, copy satuan/terpilih/semua, dan double-click buka di editor
- **Events Mendatang di Ringkasan** — card "Events Mendatang" muncul di Ringkasan PM (kolom kanan) dan Ringkasan Admin (sebelum Red Flags); data dibagi dari cache badge tanpa request tambahan

### Diperbaiki
- Kanban: drag IN_PROGRESS → OPEN untuk task kind BUG/QC kini berfungsi
- Kanban: tombol hapus bulk dan hapus per-card tersedia di mode Select
- Events: form create/edit kini inline (route navigation), bukan modal — tombol Simpan berfungsi reliabel
- Events: list tidak lagi kosong setelah membuat event (default showAll=true, bukan upcoming)
- Events: tag filter tidak lagi menampilkan data stale setelah tag baru dibuat
- Events: tombol edit dari card membuka form edit (bukan detail view)
- Events: event multi-tag tidak lagi tampil duplikat saat grouping per tag

---

## [0.4.6] - 2026-05-18

### Ditambahkan
- Pengaturan zona waktu laporan harian (WIB / WITA / WIT / UTC) — cron dan label tanggal mengikuti zona yang dipilih
- Filter Tasks dikelompokkan: Scope, Tipe Task, Tanggal Due, dan Cari & Tampilan
- Filter range tanggal due date di Tasks, dengan penanda hari ini berwarna orange di kalender
- Kanban: pagination per kolom (prev/next, 20 item/halaman) — halaman tetap tersimpan saat drag-drop
- Endpoint diagnostik laporan harian `/api/admin/report/diagnose` — dapat diakses via Bearer MCP_SECRET
- MCP tool baru: `report_diagnose` — tersedia di dev dan stg
- Modal "Yang Baru" muncul otomatis saat versi berubah, dapat dibuka ulang dari sidebar

### Diperbaiki
- Kanban: konten task card (judul, assignee, due date) tidak lagi terpotong saat kolom memiliki banyak item
- Kanban: pagination kini di luar area scroll — selalu terlihat di bagian bawah kolom
- Retro: non-member tidak dapat lagi mengakses retrospektif project INTERNAL
- Google OAuth: test disesuaikan dengan arsitektur Better Auth

### Ditingkatkan
- Kanban mengambil hingga 500 task (naik dari default 100)

---

## [0.4.5] - 2026-05-13

### Ditambahkan
- Snapshot historis harian untuk konteks AI — laporan membandingkan kondisi hari ini vs kemarin vs 7 hari lalu
- Editor prompt laporan dengan preview real-time sebelum dikirim ke Telegram

### Diperbaiki
- Dedup guard laporan — mencegah pengiriman ganda dalam window cooldown

### Ditingkatkan
- UI polish berbagai panel AI dan laporan

---

## [0.4.4] - 2026-05-11

### Diperbaiki
- Format tanggal timezone-aware di laporan harian
- Test koneksi Telegram dari panel settings
- Akurasi tanggal di Gantt view

---

## [0.4.3] - 2026-05-08

### Ditambahkan
- Laporan harian otomatis via Telegram dengan Claude AI
- Konfigurasi model Claude (Opus / Sonnet / Haiku) dari panel settings
- Tombol kirim laporan manual dengan force-override cooldown

### Ditingkatkan
- Performa query admin overview
