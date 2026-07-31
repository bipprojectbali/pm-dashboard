-- Track who created a phase so a PM can update/delete only their own phases.
-- Nullable: existing phases keep NULL (creator unknown → OWNER/SUPER_ADMIN only).

-- AlterTable
ALTER TABLE "project_phase" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_phase_createdById_idx" ON "project_phase"("createdById");

-- AddForeignKey (SET NULL so deleting a user doesn't delete their phases)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'project_phase_createdById_fkey'
  ) THEN
    ALTER TABLE "project_phase"
      ADD CONSTRAINT "project_phase_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
