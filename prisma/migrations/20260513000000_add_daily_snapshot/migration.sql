CREATE TABLE "daily_snapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kpi" JSONB NOT NULL,
    "projects" JSONB NOT NULL,
    "team" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_snapshot_date_key" ON "daily_snapshot"("date");
CREATE INDEX "daily_snapshot_date_idx" ON "daily_snapshot"("date");
