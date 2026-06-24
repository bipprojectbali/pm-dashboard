-- Remove DEFAULT NOW() from updatedAt columns on Better Auth tables.
-- These defaults were added in the baseline migration but Better Auth
-- manages updatedAt itself, so the DB default causes a diff in prisma migrate diff.

ALTER TABLE "account" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "session" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "verification" ALTER COLUMN "updatedAt" DROP DEFAULT;
