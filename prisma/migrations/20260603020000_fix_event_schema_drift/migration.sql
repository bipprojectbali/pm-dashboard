-- Prisma @updatedAt tidak menggunakan DB DEFAULT — ditangani di application layer.
-- Hapus DEFAULT jika ada (idempotent: tidak error jika sudah tidak ada default).
ALTER TABLE "event" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Rename unique index agar sesuai konvensi Prisma (tablename_fieldname_key).
-- Hanya jalankan jika index lama masih ada (idempotent untuk DB yang sudah benar).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'event_tag_name_unique') THEN
    ALTER INDEX "event_tag_name_unique" RENAME TO "event_tag_name_key";
  END IF;
END $$;
