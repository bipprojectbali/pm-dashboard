-- Pindah dari Redis ke DB untuk analisa historis laporan harian/bulanan.
-- Redis capped 20 entry dan volatile; DB tidak ada batas dan persisten.

CREATE TABLE IF NOT EXISTS "report_history" (
  "id"        TEXT         NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL,
  "ok"        BOOLEAN      NOT NULL,
  "message"   TEXT         NOT NULL,
  "trigger"   TEXT         NOT NULL,
  "markdown"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "report_history_sentAt_idx"  ON "report_history"("sentAt");
CREATE INDEX IF NOT EXISTS "report_history_trigger_idx" ON "report_history"("trigger");
