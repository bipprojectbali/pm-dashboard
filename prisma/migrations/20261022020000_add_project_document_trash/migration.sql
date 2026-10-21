-- Tempat sampah untuk dokumen project, pola yang sama dengan task: DELETE hanya
-- menandai `deletedAt` dan barisnya menetap sampai cron retensi membersihkannya.
--
-- Alasannya arah kegagalan, bukan kenyamanan: tabel ini ada untuk keterlacakan
-- surat dan artefak, jadi satu misklik yang menghancurkan dokumen permanen
-- adalah kehilangan yang tidak bisa diperbaiki — sementara sampah yang menumpuk
-- hanya butuh cron. Objek di storage sengaja TIDAK dihapus saat soft-delete;
-- restore butuh bytes-nya.
--
-- Kolom nullable, jadi tidak ada backfill: baris lama otomatis NULL = hidup.
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Tiap query dokumen selalu per project DAN selalu memilih satu sisi saja:
-- yang hidup (`deletedAt IS NULL`) atau yang di tempat sampah (`IS NOT NULL`).
-- Indeks gabungan melayani kedua sisi lewat satu jalan.
CREATE INDEX IF NOT EXISTS "project_documents_projectId_deletedAt_idx"
  ON "project_documents"("projectId", "deletedAt");
