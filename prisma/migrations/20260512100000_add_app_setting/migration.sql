CREATE TABLE "app_setting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);
