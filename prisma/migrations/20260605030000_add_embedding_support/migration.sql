-- pgvector extension untuk semantic embedding search.
-- Column embedding nullable: hanya terisi jika embedding settings dikonfigurasi.
-- Gunakan model OpenRouter/OpenAI-compatible apapun yang menghasilkan 1536 dimensi.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "chat_document"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- IVFFlat index untuk cosine similarity search (efisien untuk ratusan-ribuan dokumen)
-- Buat setelah ada data: CREATE INDEX CONCURRENTLY jika sudah ada data.
-- Index ini dibuat kosong sekarang, akan diisi saat ada data embedding.
CREATE INDEX IF NOT EXISTS "chat_document_embedding_idx"
  ON "chat_document" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 10);
