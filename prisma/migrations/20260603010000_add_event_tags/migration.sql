-- Team-wide tags untuk event, dan relasi m2m event↔tag.

CREATE TABLE IF NOT EXISTS "event_tag" (
  "id"    TEXT NOT NULL,
  "name"  TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'blue',
  CONSTRAINT "event_tag_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "event_tag_name_unique" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "event_tag_link" (
  "eventId" TEXT NOT NULL,
  "tagId"   TEXT NOT NULL,
  CONSTRAINT "event_tag_link_pkey" PRIMARY KEY ("eventId", "tagId")
);

ALTER TABLE "event_tag_link"
  ADD CONSTRAINT "event_tag_link_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "event_tag_link"
  ADD CONSTRAINT "event_tag_link_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "event_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

CREATE INDEX IF NOT EXISTS "event_tag_link_tagId_idx" ON "event_tag_link"("tagId");
