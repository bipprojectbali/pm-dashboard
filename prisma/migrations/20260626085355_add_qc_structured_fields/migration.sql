-- AlterTable
ALTER TABLE "task" ADD COLUMN     "actual" TEXT,
ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "environment" TEXT,
ADD COLUMN     "expected" TEXT,
ADD COLUMN     "stepsToReproduce" TEXT;
