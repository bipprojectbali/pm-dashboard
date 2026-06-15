-- CreateTable: MilestoneTag join table (relasi Tag ↔ ProjectMilestone)
CREATE TABLE IF NOT EXISTS "milestone_tag" (
    "milestoneId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "milestone_tag_pkey" PRIMARY KEY ("milestoneId","tagId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "milestone_tag_tagId_idx" ON "milestone_tag"("tagId");

-- AddForeignKey
ALTER TABLE "milestone_tag" ADD CONSTRAINT "milestone_tag_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_tag" ADD CONSTRAINT "milestone_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
