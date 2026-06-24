-- Add composite and column indexes to support server-side pagination queries.
-- These indexes speed up per-status kanban fetches (projectId, status),
-- overdueOnly filter (dueAt), and priority filter (priority).

CREATE INDEX IF NOT EXISTS "task_projectId_status_idx" ON "task"("projectId", "status");
CREATE INDEX IF NOT EXISTS "task_dueAt_idx" ON "task"("dueAt");
CREATE INDEX IF NOT EXISTS "task_priority_idx" ON "task"("priority");
