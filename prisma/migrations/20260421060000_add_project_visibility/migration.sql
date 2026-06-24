-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('PRIVATE', 'INTERNAL', 'PUBLIC');

-- AlterTable
ALTER TABLE "project" ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'INTERNAL';
