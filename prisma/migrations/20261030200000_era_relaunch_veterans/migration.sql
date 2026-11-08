-- Era relaunch veterans: erasure notices with a fixed cutoff and shorter
-- deadlines, and keyed fingerprints of erased-era accounts so returning
-- players can be recognised and given the Era 1 Tester title.

CREATE TYPE "VeteranTitle" AS ENUM ('ERA1_TESTER');
CREATE TYPE "InactivityNoticeTemplate" AS ENUM ('STANDARD', 'ERA_RELAUNCH');

CREATE TABLE "VeteranRecord" (
    "id" SERIAL NOT NULL,
    "emailHash" TEXT NOT NULL,
    "displayNameHash" TEXT NOT NULL,
    "title" "VeteranTitle" NOT NULL,
    "sourceUserId" INTEGER,
    "originalJoinedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "claimedByUserId" INTEGER,
    "claimedAt" TIMESTAMPTZ(3),

    CONSTRAINT "VeteranRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VeteranRecord_emailHash_key" ON "VeteranRecord"("emailHash");
CREATE INDEX "VeteranRecord_expiresAt_idx" ON "VeteranRecord"("expiresAt");
CREATE UNIQUE INDEX "VeteranRecord_claimedByUserId_key" ON "VeteranRecord"("claimedByUserId");

ALTER TABLE "VeteranRecord" ADD CONSTRAINT "VeteranRecord_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VeteranRecord" ADD CONSTRAINT "VeteranRecord_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VeteranRecord" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "users" ADD COLUMN "veteranTitle" "VeteranTitle",
ADD COLUMN "veteranSince" TIMESTAMPTZ(3);

ALTER TABLE "AccountInactivityNotice" ADD COLUMN "inactiveSince" TIMESTAMPTZ(3),
ADD COLUMN "template" "InactivityNoticeTemplate" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "newsPostId" INTEGER;
