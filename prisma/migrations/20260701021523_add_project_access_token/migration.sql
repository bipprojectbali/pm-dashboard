-- CreateEnum
CREATE TYPE "ProjectTokenScope" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "ProjectTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "project_access_token" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scope" "ProjectTokenScope" NOT NULL DEFAULT 'READ',
    "status" "ProjectTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_access_token_tokenHash_key" ON "project_access_token"("tokenHash");

-- CreateIndex
CREATE INDEX "project_access_token_projectId_idx" ON "project_access_token"("projectId");

-- CreateIndex
CREATE INDEX "project_access_token_status_idx" ON "project_access_token"("status");

-- CreateIndex
CREATE INDEX "project_access_token_createdById_idx" ON "project_access_token"("createdById");

-- AddForeignKey
ALTER TABLE "project_access_token" ADD CONSTRAINT "project_access_token_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access_token" ADD CONSTRAINT "project_access_token_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
