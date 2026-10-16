-- CreateEnum
CREATE TYPE "ApiClientType" AS ENUM ('USER', 'SYSTEM', 'SERVICE');

-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER,
    "name" TEXT NOT NULL,
    "clientType" "ApiClientType" NOT NULL DEFAULT 'USER',
    "status" "ApiClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "lastIpHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiTokenAudit" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ipHash" TEXT,
    "uaHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiTokenAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiClient_ownerUserId_idx" ON "ApiClient"("ownerUserId");

-- CreateIndex
CREATE INDEX "ApiClient_status_idx" ON "ApiClient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenPrefix_key" ON "ApiToken"("tokenPrefix");

-- CreateIndex
CREATE INDEX "ApiToken_clientId_idx" ON "ApiToken"("clientId");

-- CreateIndex
CREATE INDEX "ApiToken_revokedAt_idx" ON "ApiToken"("revokedAt");

-- CreateIndex
CREATE INDEX "ApiToken_expiresAt_idx" ON "ApiToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiTokenAudit_tokenId_createdAt_idx" ON "ApiTokenAudit"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiTokenAudit_route_createdAt_idx" ON "ApiTokenAudit"("route", "createdAt");

-- AddForeignKey
ALTER TABLE "ApiClient" ADD CONSTRAINT "ApiClient_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiTokenAudit" ADD CONSTRAINT "ApiTokenAudit_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
