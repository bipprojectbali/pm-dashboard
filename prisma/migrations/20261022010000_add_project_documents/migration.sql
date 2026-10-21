-- Dokumen tingkat project (dokumentasi, artefak, surat-surat). Sebelumnya file
-- hanya bisa menempel di task (task_evidence); tidak ada tempat untuk file
-- milik project itu sendiri, jadi dokumen tersebar di Google Drive tanpa jejak
-- siapa menambah/menghapus apa.
--
-- Tiap field traceability (uploadedById, originalName, mimeType, sizeBytes)
-- jadi kolom sendiri — bukan diseret ke dalam `note` free-text seperti
-- task_evidence — karena justru jejak itulah alasan tabel ini ada.

CREATE TABLE IF NOT EXISTS "project_documents" (
  "id"           TEXT         NOT NULL,
  "projectId"    TEXT         NOT NULL,
  "title"        TEXT         NOT NULL,
  "storedName"   TEXT         NOT NULL,
  "originalName" TEXT         NOT NULL,
  "mimeType"     TEXT         NOT NULL,
  "sizeBytes"    INTEGER      NOT NULL,
  "note"         TEXT,
  "uploadedById" TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_documents_projectId_idx" ON "project_documents"("projectId");

-- Project dihapus → dokumennya ikut hilang (baris tanpa project tidak punya
-- arti). Uploader TIDAK boleh hilang diam-diam: RESTRICT supaya penghapusan
-- user yang masih memegang jejak dokumen gagal keras, bukan menghapus jejaknya.
DO $$
BEGIN
  ALTER TABLE "project_documents"
    ADD CONSTRAINT "project_documents_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "project_documents"
    ADD CONSTRAINT "project_documents_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
