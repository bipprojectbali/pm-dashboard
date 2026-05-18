# Changelog

Semua perubahan penting pada pm-dashboard dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

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
