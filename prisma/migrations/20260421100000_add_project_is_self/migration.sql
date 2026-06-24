-- AlterTable
ALTER TABLE "project" ADD COLUMN "isSelf" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "project_isSelf_idx" ON "project"("isSelf");
