-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "project_phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PhaseStatus" NOT NULL DEFAULT 'PLANNING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_phase_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "task" ADD COLUMN "phaseId" TEXT;

-- CreateIndex
CREATE INDEX "project_phase_projectId_idx" ON "project_phase"("projectId");

-- CreateIndex
CREATE INDEX "project_phase_projectId_status_idx" ON "project_phase"("projectId", "status");

-- CreateIndex
CREATE INDEX "task_phaseId_idx" ON "task"("phaseId");

-- AddForeignKey
ALTER TABLE "project_phase" ADD CONSTRAINT "project_phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
