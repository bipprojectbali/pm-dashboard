-- Add kanbanOrder to task table for stable kanban column ordering.
-- Default 0 for existing rows; will be backfilled by the app on first drag.
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "kanbanOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: assign sequential order per (projectId, status) based on createdAt
-- so existing tasks start with a reasonable order instead of all being 0.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "projectId", status ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "task"
)
UPDATE "task"
SET "kanbanOrder" = ranked.rn
FROM ranked
WHERE "task".id = ranked.id;

-- Index for fast orderBy (status, kanbanOrder) used in GET /api/tasks
CREATE INDEX IF NOT EXISTS "task_status_kanbanOrder_idx" ON "task" (status, "kanbanOrder");
