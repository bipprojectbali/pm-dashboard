-- Tabel event untuk pengingat/jadwal tim bersama. Team-wide, projectId opsional.

CREATE TABLE IF NOT EXISTS "event" (
  "id"          TEXT         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "startsAt"    TIMESTAMP(3) NOT NULL,
  "endsAt"      TIMESTAMP(3),
  "location"    TEXT,
  "projectId"   TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event"
  ADD CONSTRAINT "event_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "event"
  ADD CONSTRAINT "event_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

CREATE INDEX IF NOT EXISTS "event_startsAt_idx" ON "event"("startsAt");
CREATE INDEX IF NOT EXISTS "event_projectId_idx" ON "event"("projectId");
