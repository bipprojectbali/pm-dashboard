-- CreateTable
CREATE TABLE "phase_tag" (
    "phaseId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "phase_tag_pkey" PRIMARY KEY ("phaseId","tagId")
);

-- CreateIndex
CREATE INDEX "phase_tag_tagId_idx" ON "phase_tag"("tagId");

-- AddForeignKey
ALTER TABLE "phase_tag" ADD CONSTRAINT "phase_tag_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_tag" ADD CONSTRAINT "phase_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
