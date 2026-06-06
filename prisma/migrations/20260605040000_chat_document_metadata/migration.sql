-- chat_document: projectId opsional untuk filter cepat per proyek
-- + composite index (type, syncedAt) untuk prune & freshness scan.

ALTER TABLE "chat_document"
  ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "chat_document_projectId_idx"
  ON "chat_document"("projectId");

CREATE INDEX IF NOT EXISTS "chat_document_type_syncedAt_idx"
  ON "chat_document"("type", "syncedAt");
