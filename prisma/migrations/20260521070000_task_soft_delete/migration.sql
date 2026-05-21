-- Soft delete support for tasks: track who deleted, when, and why.
-- Columns nullable so existing rows are unaffected.
ALTER TABLE "task"
  ADD COLUMN IF NOT EXISTS "deletedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

ALTER TABLE "task"
  ADD CONSTRAINT "task_deletedById_fkey"
    FOREIGN KEY ("deletedById")
    REFERENCES "user"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
  NOT VALID;

CREATE INDEX IF NOT EXISTS "task_deletedAt_idx" ON "task"("deletedAt");
