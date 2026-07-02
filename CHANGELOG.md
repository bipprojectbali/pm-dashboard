# Changelog

Semua perubahan penting pada pm-dashboard dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

---

## [Unreleased]

### Ditambahkan
- **Agent REST API — pagination & statistik**: `GET /api/agent/tasks` kini paginasi penuh (`page`/`limit`, respons `{count,page,limit,total,totalPages,tasks}`) sehingga project dengan >200 task bisa dibaca seluruhnya dan agent tahu total sebenarnya. Endpoint baru `GET /api/agent/tasks/stats` memberi rekap jumlah per status/kind/priority dalam satu panggilan.
- **Agent REST API — baca lebih lengkap**: `GET /api/agent/tasks/:id` kini mengembalikan komentar, evidence, riwayat perubahan status, dan item checklist lengkap dengan `id` (agar bisa di-update/hapus). Endpoint baru `GET /api/agent/project` memberi metadata project (anggota, fase, milestone) agar agent tak buta konteks.
- **CLI agent** (`bun run agent <cmd>`): pembungkus lokal yang membaca `.env.agent` untuk menjalankan surface di atas dari terminal — `tasks`, `stats`, `get`, `project`, `guide`, `create`, `comment`.
- **Agent REST API — endpoint baru (write parity)**: `POST /api/agent/tasks/:id/evidence` (link evidence), `POST /api/agent/tasks/:id/claim` (atomic OPEN/REOPENED→IN_PROGRESS dengan guard updateMany), `DELETE /api/agent/tasks/:id` (soft-delete via `deletedAt`), `POST/DELETE /api/agent/tasks/:id/dependencies` (tambah/hapus dependency dengan deteksi siklus BFS), `PATCH/DELETE /api/agent/tasks/:id/comments/:commentId` (edit/hapus komentar bertag `AGENT` — komentar manusia dilindungi).
- **Agent REST API — PATCH field parity**: PATCH kini menerima `kind`, `route`, `startsAt`, `phaseId`, `tagIds` (ganti set tag sekaligus), plus notifikasi `notifyTaskStatusChanged`/`notifyTaskAssigned` otomatis dikirim saat transisi status atau pergantian assignee.
- **Agent REST API — `retryCount` + `shouldEscalate`**: `GET /api/agent/tasks/:id` kini menyertakan jumlah bounce READY_FOR_QC→REOPENED dan sinyal eskalasi (≥3 bounce → `shouldEscalate: true`), mirroring signal yang ada di `ticket_pick` MCP.
- **Agent REST API — filter `?tag=`**: `GET /api/agent/tasks` menerima `?tag=<nama>` (case-insensitive) dan respons list kini menyertakan array `tags[]` per task.
- **Agent REST API — rate limiter**: middleware Redis fixed-window 100 req/60s per token prefix diterapkan ke semua route `/api/agent/*`; melebihi batas → 429 `{ error, retryAfter }`.

### Diperbaiki
- **Agent REST API — error 400, bukan 500**: `kind`/`priority` tak valid dan body JSON rusak kini dijawab 400 yang jelas (sebelumnya memicu error Prisma → 500). Diperluas ke `dueAt` tak valid, `estimateHours` non-angka, dan tipe salah pada update checklist — semuanya kini 400 (terverifikasi memang 500 sebelumnya).
- **Agent REST API — filter enum case-insensitive + filter baru**: `status`/`kind`/`priority` menerima huruf kecil (mis. `?kind=task`); ditambah filter `priority` dan `search` (judul/deskripsi) di `GET /api/agent/tasks`. Pesan error disamakan ke bahasa Inggris agar konsisten.
- **Agent REST API — detail lebih lengkap**: `GET /api/agent/tasks/:id` kini menyertakan `tags` dan dependency `blockedBy`/`blocks` beserta info task tertaut (id/judul/status/kind), bukan sekadar hitungan.
- **Panduan agent (`GET /api/agent/guide`) akurat**: state machine transisi status diperbaiki (TASK tak punya READY_FOR_QC), plus dokumentasi pagination, envelope respons, endpoint baru, dan cara membaca id checklist.

## [0.7.27] - 2026-07-02

### Ditambahkan
- **Pencarian & sortir kolom di panel File Health (Konsol Dev)**: kotak cari path (debounced) dan header kolom yang bisa diklik untuk mengurutkan (File/Baris/Karakter/%/Status, toggle naik-turun) — memudahkan menemukan file spesifik atau melihat file terbesar lebih dulu. Logika filter+sort diekstrak jadi fungsi murni + unit test.
- **Pencarian & pagination di panel Pengguna (Konsol Dev)**: kotak cari nama/email (debounced), filter role, dan pagination 20/halaman — sebelumnya seluruh tabel user dirender sekaligus. Endpoint `GET /api/admin/users` kini menerima query opsional `search`/`role`/`limit`/`offset` (backward-compatible: tanpa `limit` tetap mengembalikan seluruh roster untuk pemakai lain). Ditambah test integrasi.

### Diubah
- **Refactor internal**: `src/routes/agent.route.ts` (265 baris, 213% dari batas FILE-HEALTH) dipecah jadi barrel + submodul `src/routes/agent/{guide,tasks,tasks.write,checklist}.route.ts` + `shared.ts`. Route task read (list/get) dan write (create/patch) dipisah agar tiap file di bawah batas karakter route-handler. Tanpa perubahan perilaku — semua endpoint `/api/agent/*`, urutan mount, dan respons identik (21 test integrasi tetap lulus).
- **Refactor internal**: MCP tool `scripts/mcp/tools/tasks.write.ts` (331 baris, 113% dari batas FILE-HEALTH) dipecah jadi barrel + `tasks.write.{core,comments,evidence}.ts`. 9 tool (`task_create`/`task_update`/`task_delete`/`task_transition`/`task_comment`/`task_comment_update`/`task_comment_delete`/`task_add_evidence`/`task_delete_evidence`) dengan urutan registrasi identik — penting karena token-scoped MCP server memanennya via capture-proxy. Tanpa perubahan perilaku (test MCP endpoint tetap lulus).
- **Refactor internal**: `src/frontend/components/taskspanel/TasksFilterBar.tsx` (331 baris, 111% dari batas FILE-HEALTH) — isi panel filter lanjutan (Scope/Tipe Task/Urutan/Tanggal Due) diekstrak ke `TasksAdvancedFilters.tsx`, props dibagikan lewat `AdvancedFilterProps` di `types.ts`. Tanpa perubahan perilaku/tampilan — props publik `TasksFilterBar` tetap sama.
- **Refactor internal**: `src/frontend/components/projectsettings/AccessTokensCard.tsx` (331 baris, 111% dari batas FILE-HEALTH) — modal show-once token diekstrak ke `accesstokens/ShowOnceModal.tsx` dan helper (api/format/types/color) ke `accesstokens/helpers.ts`. Tanpa perubahan perilaku/tampilan — props publik `AccessTokensCard` tetap sama.
- **Refactor internal**: `src/frontend/components/admin/UsersPanel.tsx` (321 baris, 107% dari batas FILE-HEALTH) — baris tabel user diekstrak ke `userspanel/UserRow.tsx` dan konstanta (tipe/roleBadge/roleFilterOptions/PAGE_SIZE) ke `userspanel/shared.ts`. Tanpa perubahan perilaku/tampilan.
- **Refactor internal**: `src/frontend/components/taskdetail/EvidenceSection.tsx` (306 baris, 102% dari batas FILE-HEALTH) — komponen drag-drop/paste `EvidenceUploader` diekstrak ke file sendiri. Tanpa perubahan perilaku/tampilan — props publik `EvidenceSection` tetap sama.

### Diperbaiki
- **Dokumentasi setup test** (`.env.example`): `.env.test` wajib memuat variabel `MINIO_*` (nilai dummy cukup) agar `bun test` bisa boot — sebelumnya suite gagal total karena `MINIO_ENDPOINT` wajib di `src/lib/env.ts`.

## [0.7.26] - 2026-07-02

### Ditambahkan
- **Fase (tab project detail)**: tiga tampilan via toggle — Stepper (default), Grid, dan List — plus filter status (Planning/Active/Completed dengan warna + ikon), pencarian judul, dan pagination 10/halaman. Pilihan view + filter status tersimpan di browser.
- **Filter Fase di panel Tasks (`/pm`)**: kotak pencarian, filter status (warna + ikon), toggle tampilan Grid/List, dan pagination 12/halaman saat fase mencapai puluhan. Pilihan view + filter status tersimpan.
- **Panel Filter di panel Tasks (`/pm`)** kini bisa diciutkan (collapse) dan pilihannya tersimpan — saat diciutkan muncul badge jumlah filter aktif + tombol reset cepat.

### Diperbaiki
- **Restore & Hapus Permanen task dari Trash** selalu gagal dengan "Task not found in trash". Query keliru mencari task aktif (`deletedAt: null`) alih-alih task di trash; kini menargetkan trash dengan benar. Ditambah cakupan test integrasi untuk restore/purge.

## [0.7.25] - 2026-07-01

### Ditambahkan
- **Project Access Token** — tiap project bisa membuat token akses sendiri (di Settings → Access Tokens, khusus OWNER/PM/admin) dengan scope READ atau WRITE dan masa berlaku opsional. Token ditampilkan **sekali** saat dibuat. Dipakai agent/CLI untuk mengakses data project tanpa login UI.
- **Akses agent lewat MCP (`POST /mcp`)** — agent coding (Claude Code) bisa connect sebagai MCP client memakai token project → otomatis dapat tool yang ter-scope ke project itu (task/bug: baca dengan READ, baca+tulis dengan WRITE). Ide read-only.
- **Akses agent lewat REST (`/api/agent/*`)** — alternatif ringan dari MCP untuk script/CI: list/get/create/update/comment/checklist task via `curl` dengan header token. Panduan lengkap (auth-gated) di `GET /api/agent/guide`.
- **Hapus evidence** — attachment/gambar bukti pada task & tiket QC bisa dihapus (tombol di tab Evidence, khusus member writable). File ikut terhapus dari penyimpanan.
- **Tempel gambar dari clipboard** — di tab Evidence, screenshot bisa langsung ditempel (Ctrl/Cmd+V) tanpa menyimpan file dulu.

### Diubah
- **Penyimpanan file evidence pindah ke MinIO (object storage)** — screenshot/log/PDF tidak lagi disimpan di disk container (yang hilang tiap deploy) melainkan di MinIO yang persisten. Akses tetap lewat proxy ber-otorisasi (`/api/evidence/:file`) sehingga privasi terjaga; file lama di disk tetap bisa dibuka (fallback). **Wajib set env `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET` sebelum deploy** — app tidak akan start tanpanya.

### Diperbaiki
- **Dev server error `res.appendHeader is not a function`** — bridge Bun↔Vite tidak mengimplementasikan method `appendHeader` yang dipanggil Vite versi baru; setiap request dev jadi 500. (Hanya memengaruhi mode development.)

## [0.7.24] - 2026-06-30

### Ditambahkan
- **Jenis task baru: Tiket & Pengembangan (Ide)** — `kind` task bertambah `TICKET` dan `IDEA`. **Tiket** adalah permintaan/laporan masuk yang ditriage (siklus penuh seperti Bug). **Ide** adalah catatan pengembangan "biar tidak lupa" — hanya berstatus Open (aktif) atau Closed (ditolak/diarsipkan).
- **Papan gabungan lintas-project di `/pm`** — dua tab baru: **Tiket** (papan triage tiket dari semua project, untuk dipantau saat meeting harian) dan **Pengembangan** (daftar ide lintas project). Masing-masing punya stat cards, filter (project/status/prioritas/assignee), dan tombol quick-create dengan jenis sudah terisi.
- **Naik kelas Ide → Task** — ide yang diputuskan dikerjakan bisa diubah jadi Task lewat tombol "Jadikan Task" di panel detail. Perubahan tercatat di log aktivitas (siapa & kapan).
- **Indikator jumlah di kartu Kanban** — tiap kartu kini menampilkan jumlah checklist (selesai/total), komentar, evidence, dan dependency tanpa harus membuka detail.

### Diperbaiki
- **View Kanban & grafik tidak refresh setelah tambah/hapus task** — sebelumnya task baru tidak muncul di papan Kanban sampai halaman di-reload; kini semua view (tabel, Kanban, grafik) ikut diperbarui otomatis.
- **Metrik dashboard tidak tercemar ide** — Ide dikecualikan dari semua perhitungan beban kerja (health/load/risk/analytics/effort/retro) sehingga tumpukan ide yang belum dikerjakan tidak menurunkan skor kesehatan project atau membuat seseorang terlihat overload.
- **Seed dev kembali bisa dijalankan** — `prisma db seed` sebelumnya selalu gagal karena masih mereferensikan tabel pm-watch (Agent/ActivityEvent/WebhookToken) yang sudah dihapus; kode mati dibersihkan dan ditambahkan data contoh Tiket/Ide.

## [0.7.23] - 2026-06-29

### Diperbaiki
- **Fase loading "Mencari data" di Chat AI** — saat AI menjalankan tool untuk mengambil data, status loading kini berganti dari "Menganalisis pertanyaan..." menjadi "Mencari data...", lalu "Memproses data & menyusun jawaban..." saat menyusun jawaban. Sebelumnya label "Menganalisis pertanyaan..." bertahan sepanjang round-trip pertama ke Claude + eksekusi tool sehingga terlihat macet terlalu lama.

## [0.7.22] - 2026-06-29

### Diperbaiki
- **Indikator loading Chat AI setelah tool call** — saat AI selesai memverifikasi data lewat tool ("DIVERIFIKASI DARI N TOOL CALL") lalu menyusun jawaban final, kini muncul animasi loading + teks status ("Memproses data & menyusun jawaban..."). Sebelumnya hanya tampil kursor statis sehingga terlihat seperti berhenti.

## [0.7.21] - 2026-06-29

### Ditambahkan
- **Deskripsi project di Overview** — deskripsi project kini tampil sebagai kartu di tab Overview, dan URL `http(s)` di dalamnya otomatis jadi link yang membuka tab baru. Deskripsi duplikat di bawah header project dihapus agar tampil sekali saja.
- **Edit & hapus komentar** — komentar pada task dan tiket QC bisa diubah atau dihapus oleh penulisnya atau ADMIN/SUPER_ADMIN. Komentar yang diedit menampilkan penanda "(telah diedit)".
- **Sesi Chat AI tersimpan** — percakapan Chat AI bertahan saat berpindah tab di `/admin` (disimpan ke sessionStorage), tidak lagi hilang saat tab Chat di-unmount.

## [0.7.20] - 2026-06-29

### Diperbaiki
- **Teks status loading Chat AI** — saat AI sedang berpikir kini muncul teks status ("Menganalisis pertanyaan..." / "Memproses data & menyusun jawaban...") di bawah animasi loading, bukan hanya ikon titik. Event SSE `phase` dari loop Claude sebelumnya tidak menyertakan `label` yang dibaca frontend.
- **Halaman Laporan Portfolio crash** — halaman `/admin/report` error 500 karena masih mereferensikan KPI agent/webhook dan section variance effort milik fitur PM-WATCH yang sudah dihapus; backend tidak lagi mengembalikan field tersebut. Referensi mati dibersihkan.

## [0.7.19] - 2026-06-26

### Ditambahkan
- **Form bug-report terstruktur saat buat QC ticket** — Description bebas diganti field wajib Langkah reproduksi / Hasil yang diharapkan / Hasil aktual, plus Environment / Browser / Versi opsional (`environment` + `appVersion` auto-isi dari `/api/version`). Field tersimpan sebagai kolom `Task` nullable sekaligus disusun jadi markdown `description`. Path free-text lama tetap didukung (back-compat).
- **Peringatan duplikat saat buat ticket** — judul ticket (debounce, ≥4 karakter) dicek via trigram `pg_trgm` terhadap ticket `ai-queue` yang masih terbuka; kecocokan tampil sebagai Alert kuning berisi ticket serupa yang bisa diklik. Non-blocking — submit tetap aktif.
- **"Minta Revisi" satu klik** — saat status ticket `READY_FOR_QC`, reviewer bisa menolak perbaikan via satu modal: alasan wajib + transisi `READY_FOR_QC → REOPENED` atomik, menggantikan dua langkah terpisah yang sering lupa menyertakan komentar.
- **Notifikasi perubahan status ticket** — setiap transisi status QC mengirim notifikasi ke reporter + assignee (minus aktor) sehingga loop Claude↔QC muncul di bell, bukan senyap.
- **Pencarian & sortir tabel ticket** — kotak pencarian (debounce 300ms; cocokkan judul/deskripsi/route) + header kolom sortir (Judul/Prioritas/Tanggal, klik untuk toggle asc/desc). State tersimpan di URL.
- **Pagination tabel ticket** — daftar ticket dipaginasi 25 per halaman; state halaman di `?page=` dan reset ke 1 saat filter/pencarian/sortir berubah.
- **Upload screenshot di drawer ticket** — section Evidence pada detail ticket kini punya tombol "Upload Screenshot". Gambar diupload langsung saat dipilih (bisa multiple). Screenshot tampil sebagai thumbnail 4-kolom; klik thumbnail membuka lightbox modal. Evidence non-gambar (LINK) tetap tampil seperti sebelumnya.
- **Assignee select di drawer ticket** — ADMIN/SUPER_ADMIN dapat memilih atau menghapus assignee langsung dari drawer via Select searchable + clearable. QC role melihat assignee sebagai teks read-only.
- **Bulk update ticket** — checkbox per baris di tabel ticket (dengan select-all + indeterminate). Saat ≥1 dipilih, toolbar bulk muncul: ubah status/prioritas (semua role QC) atau assignee (ADMIN/SUPER_ADMIN) → "Terapkan" lewat satu PATCH atomik.
- **Kolom Tanggal** — tanggal input ticket ditampilkan di tabel; hover untuk melihat waktu lengkap.

### Diubah
- Default filter status halaman QC dari "Open" menjadi "All".

### Diperbaiki
- `evidence.label` di tipe frontend diubah ke `evidence.note` (sesuai field DB yang sebenarnya).

## [0.7.18] - 2026-06-25

### Ditambahkan
- **Upload screenshot saat buat QC ticket** — form "New QC Ticket" kini punya tombol "Pilih Gambar" untuk melampirkan satu atau lebih screenshot. Gambar ditampilkan sebagai thumbnail 4-kolom dengan tombol ✕ per gambar. Setelah ticket dibuat, setiap gambar diupload ke endpoint baru `POST /api/qc/tickets/:id/evidence/upload` dan otomatis tersimpan sebagai evidence `SCREENSHOT`.
- **Endpoint upload** `POST /api/qc/tickets/:id/evidence/upload` — terima `multipart/form-data` field `file` (image only, validasi MIME + ukuran via `UPLOAD_MAX_BYTES`). File disimpan di `UPLOADS_DIR/evidence/:ticketId/` dengan nama UUID acak. Balas `{ evidence }` dengan `kind: SCREENSHOT` dan URL yang bisa diakses via `/api/evidence/:file`.

## [0.7.16] - 2026-06-25

### Ditambahkan
- **Phase Tags** — fase/sprint kini bisa diberi tag dari pool tag project. Tag muncul sebagai badge di stepper dan bisa dipakai untuk filter fase. Input tag menggunakan `TagsInput`: ketik nama tag yang sudah ada untuk memilih dari suggestion, ketik nama baru lalu Enter untuk membuat tag baru otomatis saat fase disimpan.
- **Pagination fase** — stepper fase kini dipaginasi 10 per halaman saat total fase lebih dari 10. Menampilkan counter "X–Y dari Z fase" dan kontrol halaman; halaman reset otomatis saat filter tag berubah.

### Diperbaiki
- Modal yang dibuka via `modals.open()` kini bisa menggunakan hook TanStack Query (`useQuery`, `useMutation`, `useQueryClient`) — sebelumnya crash blank karena `QueryClientProvider` berada di dalam `ModalsProvider`.

## [0.7.15] - 2026-06-24

### Ditambahkan
- **Bulk add member** — MultiSelect dengan opsi "Pilih Semua" di dropdown memungkinkan menambahkan banyak member sekaligus. Tombol Add menampilkan jumlah (`Add (3)`) saat lebih dari satu dipilih; semua ditambahkan paralel lewat `Promise.all`.
- **Bulk delete member** — checkbox per member (non-owner) dengan "Pilih semua" + indeterminate state. Tombol "Hapus (N)" muncul saat ada yang dipilih; konfirmasi via `confirm()`, kemudian hapus paralel lewat `Promise.all` dan invalidate query.
- **Edit Kesimpulan fase** — kartu Kesimpulan pada fase COMPLETED kini collapsible (chevron toggle). Ikon pensil saat expanded membuka modal `size="lg"` dengan Textarea pre-filled. Teks Kesimpulan dan Deskripsi mendukung newline (`whiteSpace: pre-wrap`). Modal Detail dan modal Selesaikan Fase juga diperlebar ke `size="lg"`.

## [0.7.14] - 2026-06-24

### Diperbaiki
- Navbar mobile tidak lagi transparan di Konsol Dev, Admin, dan Manajer Proyek — konten halaman di belakang menu tidak tembus saat drawer terbuka.

## [0.7.13] - 2026-06-24

### Diubah
- Refactor file-health: 9 file yang melebihi batas ukuran dipecah menjadi handler/helper/sub-component terpisah tanpa perubahan behavior (dev-graph, query, auth, trash, evidence routes; PhasesSection, ProjectCard, SnapshotHistoryPanel, SessionsPanel).

## [0.7.12] - 2026-06-17

### Diperbaiki
- Kartu "Kesimpulan" pada fase COMPLETED kini menyesuaikan dark/light mode (sebelumnya latar hijau terang `green.0` membuat teks nyaris tak terbaca di dark mode). Beralih ke variabel tema Mantine `green-light` agar kontras di kedua tema.

## [0.7.11] - 2026-06-17

### Diperbaiki
- Kontrol edit, hapus, dan ubah status fase kini tampil untuk semua fase (sebelumnya tersembunyi karena hanya fase aktif yang me-render isi `Stepper.Step`). Aksi dipindah ke menu kebab di label fase sehingga selalu tampil.

### Ditambahkan
- Modal detail fase read-only yang bisa dibuka untuk fase berstatus apa pun (termasuk COMPLETED), menampilkan status, jumlah task, periode, deskripsi, dan kesimpulan. Dapat diakses semua user, bukan hanya pengelola proyek.

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
