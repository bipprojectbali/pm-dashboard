-- Tabel dokumen untuk RAG (Retrieval-Augmented Generation) Chat AI.
-- Menyimpan task, proyek, user, event sebagai dokumen yang bisa dicari
-- dengan full-text search + fuzzy trigram matching.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "chat_document" (
  "id"        TEXT         NOT NULL,
  "type"      TEXT         NOT NULL,
  "entityId"  TEXT         NOT NULL,
  "title"     TEXT         NOT NULL,
  "content"   TEXT         NOT NULL,
  "tags"      TEXT         NOT NULL DEFAULT '',
  "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_document_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "chat_document_type_entityId_key" UNIQUE ("type", "entityId")
);

-- Full-text search index (simple dictionary: lowercase, no stemming)
CREATE INDEX IF NOT EXISTS "chat_document_fts_idx"
  ON "chat_document" USING GIN (to_tsvector('simple', title || ' ' || content));

-- Trigram index untuk fuzzy name matching (misal: "Bagas" → "bagas", typo)
CREATE INDEX IF NOT EXISTS "chat_document_trgm_idx"
  ON "chat_document" USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "chat_document_type_idx"     ON "chat_document"("type");
CREATE INDEX IF NOT EXISTS "chat_document_syncedAt_idx" ON "chat_document"("syncedAt");
