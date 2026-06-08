-- chat_document: hapus index embedding (IVFFlat) dan title (trigram GIN) yang sudah
-- tidak didefinisikan di schema.prisma. Kedua index ini tidak terpakai di query path
-- saat ini — embedding search pakai threshold runtime, trigram digantikan FTS fallback.
-- Idempotent: IF EXISTS aman untuk re-run.

DROP INDEX IF EXISTS "chat_document_embedding_idx";
DROP INDEX IF EXISTS "chat_document_trgm_idx";
