# Changelog

Semua perubahan penting pada pm-dashboard dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

---

## [Unreleased]

### Diperbaiki
- **Form "Catat Ide" & papan Pengembangan tak lagi tampilkan field kerja komitmen**: modal Create Idea sebelumnya menampilkan Assignee, Tanggal Mulai, Tenggat, dan Estimasi Jam persis seperti form Task biasa — padahal field ini tidak pernah masuk ke metrik apa pun untuk Ide (Ide sengaja dikecualikan dari semua agregat beban kerja), sehingga bisa menyesatkan pengguna mengira sebuah ide "punya deadline" atau "sedang dikerjakan". Keempat field kini disembunyikan saat Kind = IDEA (Judul/Deskripsi/Prioritas/Tags/Fase tetap ada) dan langsung muncul kembali begitu Kind diganti ke jenis lain. Papan Pengembangan juga tidak lagi menampilkan kartu statistik dan quick-filter "Overdue"/"Blocked" (konsep yang tak berlaku untuk sebuah ide) — papan Tiket tidak terpengaruh, tetap menampilkan kelima kartu/filter seperti biasa.
- **Notifikasi assign kini membedakan Ide dari Task**: menugaskan sebuah Ide ke seseorang sebelumnya mengirim notifikasi "assigned you a task" — bahasa yang sama seperti pekerjaan komitmen sungguhan, berpotensi menimbulkan urgensi palsu terhadap sesuatu yang seharusnya cuma catatan backlog. Notifikasi kini berbunyi "assigned you an idea" khusus untuk task berjenis IDEA.
- **Kartu "Beban Tim" di menu Tim tidak lagi terpengaruh Ide**: perhitungan task terbuka/telat per anggota di menu Manajer Proyek → Tim sebelumnya ikut menghitung task berjenis Ide (IDEA) — padahal Ide sengaja dikecualikan dari semua metrik beban kerja di seluruh aplikasi (Ringkasan Admin, Triase, Analitik). Akibatnya seseorang bisa tampak "kelebihan beban" hanya karena ada catatan ide yang belum tentu dikerjakan. Sekarang task Ide tidak lagi dihitung sebagai beban kerja di menu Tim, konsisten dengan bagian lain aplikasi.
- **Kartu statistik Total/Open/Closed/Overdue di menu Task kini akurat di atas 200 task**: dashboard kartu di menu Task (baik papan Task global maupun tab Tasks di detail proyek) sebelumnya dihitung dari daftar task yang **diam-diam dibatasi 200 baris** oleh server — begitu sebuah proyek melewati ~200 task, kartu "Closed" mulai meleset jauh dari angka sebenarnya (satu kasus nyata: kartu menunjukkan 190 Closed & 200 Total padahal sesungguhnya 661 Closed & 671 Total). Kartu kini dihitung langsung di server (endpoint baru `GET /api/tasks/dashboard-stats`, tidak terpotong) sehingga akurat berapa pun jumlah task-nya; chart di bawahnya (Throughput/Status breakdown/Top assignees) tetap dari 200 task terbaru dan kini menampilkan **banner** saat datanya terpotong, bukan diam-diam menyembunyikan selisihnya. MCP tool baru `task_dashboard_stats`.

## [0.9.0] - 2026-08-03

### Ditambahkan
- **Otorisasi fase berbasis pembuat (PM)**: sebelumnya create/update/delete fase project sama-sama digate oleh aturan OWNER/PM/admin sistem, sehingga PM manapun di sebuah project bisa mengubah/menghapus fase yang dibuat PM lain. Kini: **create** tetap OWNER/PM/SUPER_ADMIN, tapi **update/delete** hanya boleh oleh OWNER, SUPER_ADMIN, atau PM yang **membuat** fase tersebut. Fase lama (dibuat sebelum fitur ini, tanpa data pembuat) hanya bisa diubah OWNER/SUPER_ADMIN. ADMIN biasa (bukan SUPER_ADMIN) tidak mendapat bypass di sini — tetap harus jadi member project. UI menu aksi per-fase kini otomatis menyembunyikan Edit/Delete untuk fase milik PM lain.

### Diperbaiki
- **Import massal task kini menerima semua 5 jenis task**: endpoint bulk-import (dipakai form CSV) sebelumnya menolak jenis Tiket dan Ide meski form single-create dan parser CSV sudah mendukung keduanya — import CSV berisi baris Tiket/Ide gagal total dengan pesan error yang juga keliru menyebut hanya 3 jenis yang valid.
- **Kartu statistik & pagination papan Tiket/Pengembangan kini akurat di atas 200 data**: papan Tiket dan Pengembangan (menu PM) menghitung kartu statistik dan pagination dari data yang sudah dipotong 200 baris di browser, sehingga angka meleset begitu jumlah task melebihi 200. Kini kartu dan tabel dihitung penuh di server, konsisten dengan halaman Triase Admin.
- **Modal "Buat Task" tidak lagi menyisakan data lama**: menutup modal via tombol Batal/X tetap mempertahankan isian (disengaja, agar tidak kehilangan input tak sengaja), tapi setelah berhasil membuat task, membuka modal lagi sekarang benar-benar kosong — sebelumnya field masih menampilkan task yang baru saja dibuat.
- **Urutan & filter tanggal jatuh tempo pada daftar Task kini benar di semua halaman**: sortir (prioritas/jatuh tempo/judul/dsb.) dan filter rentang tanggal sebelumnya hanya diterapkan pada 25 baris yang sedang tampil di browser, bukan ke seluruh data — task prioritas tinggi di halaman 2 tidak pernah naik ke atas saat diurutkan "berdasarkan prioritas". Kini sortir dan filter tanggal dihitung di server sehingga benar lintas halaman.
- **Kartu "Task Terbuka"/"Bug Terbuka" di Ringkasan PM kini menghitung semua status non-selesai**: sebelumnya hanya menghitung status OPEN, sehingga task berstatus Sedang Dikerjakan/Siap QC/Dibuka Lagi tidak ikut terhitung — bertentangan dengan tooltip kartu yang menjanjikan semua status non-selesai.
- **4 bug tampilan di detail project diperbaiki**: statistik milestone di tab Overview selalu menampilkan 0 dari total; badge "Extended" muncul pada perubahan deadline apa pun (termasuk yang dipercepat), bukan hanya saat mundur; banner "Tidak ada aktivitas" di tab Retro mengabaikan kartu Task Baru; label status pada legenda donut chart menampilkan garis bawah ganda ("READY FOR_QC").
- **Tombol filter status project kini muat 5 status dalam satu baris**: penambahan status Draft + Dibatalkan sebelumnya membuat baris tombol filter turun ke baris kedua.
- **5 inkonsistensi menu Proyek (PM) diperbaiki**: badge "Extended" muncul di setiap perubahan deadline (bukan hanya saat dimundurkan); status "Berisiko" dan "Terlambat" sebelumnya tergabung jadi satu kategori; filter status Draft dan Dibatalkan belum tersedia; subjudul daftar tidak mengikuti scope aktif; daftar project diam-diam dibatasi 200 baris tanpa indikator saat data terpotong.

## [0.8.11] - 2026-07-30

### Ditambahkan
- **Konfirmasi sebelum memblokir user**: aksi "Block User" di Konsol Admin → Pengguna kini memunculkan dialog konfirmasi yang menyebut nama + email target dan memperingatkan bahwa semua sesi aktif user itu langsung diputus — sebelumnya blokir langsung dieksekusi begitu diklik, sehingga satu salah-klik bisa mengunci seseorang. Membuka blokir (Unblock) tetap instan karena tidak destruktif.

### Diperbaiki
- **Kartu "Kesehatan Sistem" kini menampilkan semua env wajib**: tabel Environment Variables sebelumnya hanya mencantumkan 7 variabel dan tertinggal — 4 env yang **wajib** (`BETTER_AUTH_SECRET`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) tidak muncul, padahal bila salah satunya kosong aplikasi gagal boot. Akibatnya alat pemantau env ini memberi rasa aman keliru (semua tampak "SET" padahal ada wajib yang tak terpantau). Kini keempatnya tampil sebagai `required`, dan ada test yang menurunkan daftar wajib langsung dari `env.ts` agar tak drift lagi.
- **Status "Online" pada menu Sesi tak lagi keliru**: filter "Online" di Konsol Admin → Sesi ikut menampilkan sesi yang sudah **kedaluwarsa**. Penyebabnya status online dihitung per-user (bukan per-sesi), sehingga setiap sesi milik user yang sedang membuka app — termasuk sesi lamanya yang sudah expired — ikut ditandai online. Kini sesi expired tidak pernah dianggap online, sesuai maksud "Online = bagian dari Active".
- **Dokumentasi role diperbaiki**: endpoint ubah-role menerima USER/QC/ADMIN (dokumentasi sebelumnya keliru menulis hanya USER/ADMIN); perilaku aplikasi tidak berubah.
- **Analitik (Admin) — window "90 hari" kini benar-benar 90 hari**: memilih rentang "90 hari" mengirim `trendDays=90`, tapi endpoint `/api/admin/overview/analytics` diam-diam membatasi ke 60 (`Math.min(60, …)`), sehingga chart Throughput & Heatmap hanya menampilkan 60 hari padahal subtitle tertulis "90 hari terakhir". Cap endpoint dinaikkan 60→90 agar konsisten dengan lib `computeAnalytics` (yang memang sudah mendukung 90) dan opsi window di UI.
- **Analitik (Admin) — kartu statistik akurat & bebas IDEA**: menu Analitik menarik daftar task lewat `/api/tasks?limit=500`, padahal server **diam-diam membatasi 200 baris** (terverifikasi: request 500 → respons `limit: 200`), lalu menghitung kartu "Task Terbuka" / "Ditutup" dan semua chart per-task dari data terpotong itu — dan **ikut menghitung task IDEA**, sehingga bertentangan dengan chart Status/Throughput yang di-agregat server (yang sudah mengecualikan IDEA). Kini tiga kartu (**Proyek Aktif** / **Task Terbuka** / **Ditutup**) dihitung langsung dari agregat server `/api/admin/overview/analytics` (uncapped, IDEA dikecualikan) sehingga akurat pada instance dengan banyak task; chart per-task tetap dari 200 task terbaru tapi kini **mengecualikan IDEA** agar selaras, dan menampilkan **banner** saat ada task melebihi batas alih-alih menyembunyikannya. Fetch task diubah ke `limit=200` (jujur, tidak lagi 500), `timelineLimit` dirapikan 20→12 (hanya 12 yang ditampilkan), dan subtitle/tooltip diperbaiki agar jujur soal mana yang akurat-server vs capped.
- **Triase Task (Admin) — angka statistik kini akurat & konsisten**: kartu statistik (Open/Overdue/Unassigned/Blocked/Stale) sebelumnya dihitung di browser dari daftar task yang **diam-diam dibatasi 200 baris** (padahal panel meminta 500 dan tooltip mengklaim "cap 500"), dan ikut menghitung task berjenis **IDEA** — sehingga angkanya bisa salah pada instansi dengan banyak task dan tidak cocok dengan badge "task overdue" di sidebar. Kini kartu dihitung langsung di server via endpoint baru `GET /api/admin/overview/triage` (mengecualikan IDEA lewat `WORKLOAD_KIND_FILTER`, definisi overdue sama persis dengan Red Flags/sidebar). Tabel penelusuran tetap menampilkan hingga 200 task terbaru (diurut open-first agar task aktif tak terpotong) dan kini menampilkan **banner** saat ada task melebihi batas, bukan menyembunyikannya diam-diam. Tabel juga mengecualikan IDEA agar selaras dengan kartu. Tombol **Refresh** kini menyegarkan kartu statistik **dan** tabel sekaligus (sebelumnya hanya tabel, kartu tertinggal sampai auto-refresh 30 detik). Tooltip diperbaiki agar jujur. MCP tool baru `task_triage`.
- **Proyek yang diarsipkan tak lagi bocor ke daftar proyek**: `GET /api/projects` sebelumnya tetap mengembalikan proyek ber-`archivedAt` di semua scope (admin, visible, `scope=mine`), sehingga tab Proyek Admin dan kartu KPI menghitung-ganda proyek arsip dibanding widget Ringkasan yang sudah memfilternya. Kini proyek arsip disembunyikan secara default di seluruh scope (konsisten dengan agregat admin-overview dan MCP `project_list`); tambahkan `?includeArchived=true` bila memang butuh melihat arsip. Membuka proyek arsip lewat id tetap bisa (detail tidak digate arsip).
- **Daftar "Sinyal Peringatan" tak lagi menyesatkan**: di Ringkasan Admin, blok Overdue dan Past-due projects hanya menampilkan sebagian item (5 dan 3 teratas) sementara angka statistik di atasnya menunjukkan total penuh — sehingga terlihat seolah "6 proyek telat tapi cuma 3 tampil". Kini daftar diberi penanda jelas: judul "Past-due projects — top 3" dan baris "+N lagi — lihat semua di tab …" saat item terpotong.

## [0.8.9] - 2026-07-29

### Diperbaiki
- **Indikator "Online" kini akurat**: kartu Online di Konsol Dev (dan daftar presence real-time) sebelumnya selalu menampilkan 0 walau ada pengguna aktif. Penyebabnya koneksi WebSocket presence ditolak server (cookie sesi ter-URL-encode + bertanda tangan Better Auth tidak diurai dengan benar), sehingga browser terus menyambung-ulang tanpa henti. Kini koneksi bertahan dan jumlah online tampil benar.
- **Filter & label Log Audit lengkap**: panel Log Audit (Konsol Dev) dulu hanya mengenal 9 jenis aktivitas — sisanya (task, phase, project, tiket QC, evidence, tag, access token, aksi coding agent, dll.) tampil sebagai kode mentah kapital dan tidak bisa difilter. Kini seluruh ~57 jenis aktivitas punya label ramah + warna dan bisa dipilih di filter action. Teks bantuan (tooltip) juga diperbaiki agar tidak lagi menyebutkan cakupan yang keliru.
- **Diagram ER Database lengkap & akurat**: menu Database (Konsol Dev) dulu menyembunyikan 14 dari 41 relasi antar-tabel — semua relasi bernama (`@relation("Nama", …)`) seperti FK ke User (owner/reporter/assignee) dan dependency antar-task tidak tergambar sebagai garis penghubung. Selain itu 50 field menampilkan nilai default terpotong (`@default(uuid(`, `now(`). Kini seluruh 41 relasi tergambar dan nilai default fungsi (`uuid()`/`now()`/`cuid()`) tampil utuh.

## [0.8.8] - 2026-07-28

### Ditambahkan
- **Preferensi notifikasi kini benar-benar berfungsi**: mematikan toggle "Tugas baru ditugaskan ke saya" atau "Perubahan status tugas saya" di Pengaturan → Preferensi sekarang benar-benar menghentikan notifikasi tersebut (sebelumnya toggle tersimpan tapi tidak berpengaruh). Model opt-out: pengguna yang belum pernah mengatur tetap menerima semua notifikasi seperti biasa.
- **Tab & filter default Manajer Proyek**: pengaturan "Tab default saat membuka /pm" dan "Filter tugas default" di Preferensi kini berlaku — membuka halaman Manajer Proyek langsung mendarat di tab pilihanmu dengan filter tugas yang sesuai (sebelumnya tersimpan tapi tidak berpengaruh).
- **Akun Google bisa membuat password**: pengguna yang login lewat Google kini dapat membuat password lokal dari Pengaturan → Keamanan (form otomatis jadi "Buat Password"), sehingga bisa login dengan email + password sebagai alternatif.

### Diubah
- **Kartu "Proyek yang saya ikuti" di Profil lebih akurat**: kini hanya menampilkan proyek tempat kamu benar-benar menjadi owner/PM/anggota (untuk admin sekalipun), sesuai labelnya — dilengkapi tooltip penjelasan. Sebelumnya admin melihat semua proyek sistem.
- **Toggle notifikasi yang belum tersedia ditandai jelas**: "Disebut di komentar" dan "Tenggat proyek mendekat" kini bertanda "Segera hadir" dan dinonaktifkan (fiturnya belum dibangun), tidak lagi menyesatkan.

### Diperbaiki
- **Kepadatan tabel ganda dihapus dari Preferensi**: kontrol "Kepadatan tabel" yang tidak berfungsi dihapus dari Pengaturan (halaman Proyek sudah punya pengaturan kepadatan sendiri).

## [0.8.7] - 2026-07-28

### Ditambahkan
- **Riwayat versi terbaru saat membuka "Apa yang baru" manual**: ketika membuka panel "Apa yang baru" secara manual, kini ditampilkan beberapa versi rilis terakhir sekaligus (bukan hanya versi terbaru), sehingga perubahan yang terlewat tetap bisa dibaca.

### Diperbaiki
- **Jumlah task pada badge tab Fase langsung ter-refresh**: setelah membuat atau menghapus fase, angka pada badge tab tidak lagi tertinggal — jumlah diperbarui otomatis tanpa perlu refresh halaman.

## [0.8.6] - 2026-07-16

### Diperbaiki
- **Task yang dihapus langsung hilang dari board & jumlah fase ikut berkurang**: menghapus task dari drawer detail dulu menyisakan card di board Kanban sampai halaman di-refresh manual, dan jumlah task pada chip Fase serta badge tab Tasks tidak berkurang. Kini penghapusan me-refresh semua tampilan task (table/kanban/chart), jumlah fase, dan badge project sekaligus. Di sisi server, `_count.tasks` pada endpoint phases, detail project, dan agent project sekarang mengecualikan task yang di-Trash (sebelumnya task terhapus masih ikut terhitung).
- **Jawaban Chat AI langsung ke inti**: kalimat "berpikir keras" AI (mis. "Saya perlu mengumpulkan data komprehensif...") tidak lagi ikut tersimpan di jawaban final — jawaban langsung dimulai dari isinya ("Berdasarkan analisis: ...").

### Diubah
- **Indikator loading Chat AI lebih informatif**: selama AI memproses, ditampilkan pesan "Mohon tunggu sebentar, sedang ..." yang mengikuti fase (menganalisis pertanyaan → mencari data → menyusun jawaban); pada fase menyusun jawaban yang panjang, pesan berjalan maju bertahap lalu berhenti agar tidak terasa nyangkut.

## [0.8.5] - 2026-07-08

### Ditambahkan
- **Filter task berdasarkan assignee di panel Tasks**: panel Tasks (triage board) kini punya filter assignee, jadi bisa memfokuskan daftar task ke satu penanggung jawab. Filter berlaku di tampilan list maupun kanban.

## [0.8.4] - 2026-07-07

### Ditambahkan
- **Assign user langsung dari modal Create Task**: form "Single" di modal Create Task kini punya field pilih assignee (opsional), jadi task bisa langsung ditugaskan saat dibuat tanpa harus buka detail dulu. `POST /api/tasks` menerima `assigneeId` dan memicu `notifyTaskAssigned` (kecuali self-assign).

### Diperbaiki
- **Admin bisa mengedit task detail meski bukan member project**: `TaskDetailView` dulu menghitung izin edit di sisi klien dan mengabaikan `canWrite` dari server, sehingga ADMIN/SUPER_ADMIN non-member melihat detail read-only. Kini FE mempercayai `canWrite` dari server (server sudah otorisasi admin-bypass), jadi admin bisa mengedit sesuai perannya.

## [0.8.3] - 2026-07-06

### Diperbaiki
- **Task di Trash tidak lagi mencemari agregat**: task yang di-soft-delete (Trash) sebelumnya tetap menggelembungkan KPI, hitungan overdue/stale, skor kesehatan project, beban tim, dan retro — karena tiap lib agregasi membangun `where`-nya sendiri tanpa filter `deletedAt`. Kini sebuah Prisma client extension (`src/lib/prisma-soft-delete.ts`) menyuntikkan `deletedAt: null` ke **setiap** pembacaan Task, dan tiga blind-spot relasi (health `_count.tasks` + filter dependency, retro `taskStatusChange` + blocker) ditambal manual via `ACTIVE_TASK_FILTER`. Route Trash opt-out eksplisit dengan `deletedAt: { not: null }`.
- **Judul fase unik per project (case-insensitive)**: judul fase bisa terduplikasi diam-diam dalam satu project, membingungkan di tampilan Stepper yang berurutan. Kini ada guard `isPhaseNameTaken()` (`src/lib/phase-name.ts`) sebagai sumber kebenaran — create/rename yang bentrok ditolak `409` di HTTP handler, `{ ok: false, error }` di MCP `phase_create`/`phase_update`, dan form frontend (`PhaseAddForm`/`PhaseEditModal`) menonaktifkan submit + menampilkan hint sebelum request. Guard di handler/MCP (bukan DB constraint) karena unique index DB case-sensitive.

## [0.8.2] - 2026-07-02

### Ditambahkan
- **Edit `kind` task dari sidebar detail**: `kind` task (TASK/BUG/QC/TICKET) kini bisa diubah langsung dari sidebar detail, dengan guard kind↔status — perubahan `kind` ditolak `400` bila status task saat ini tak bisa dipegang oleh kind tujuan (mis. `READY_FOR_QC → TASK`). Promosi IDEA tetap lewat tombol "Naik Kelas" terpisah. Guard `isStatusValidForKind` diterapkan seragam di empat write surface (session/agent-REST/stdio-MCP/token-MCP).

## [0.8.1] - 2026-07-02

### Diubah
- **UI fase — hapus border kiri berwarna**: `PhaseRow` (filter fase di panel Tasks), `PhaseListRow`, `PhaseCard` (tab Phases project detail), dan card di Projects Board View tidak lagi menampilkan garis aksent berwarna di sisi kiri. Warna fase kini disampaikan sepenuhnya lewat ikon dan badge status. `PhaseRow` direfaktor dari `Paper` + inline styles ke `NavLink` (Mantine) + ikon berwarna via `Box c={color}`.

## [0.8.0] - 2026-07-02

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
