-- Daily item ledger check (#370): a change log written by each feature, plus
-- the checkpoint and report tables. Additive. No backfill: the first daily run
-- records a baseline from the balances at that moment.
CREATE TYPE "ItemLedgerReason" AS ENUM ('ARMORY_BUY', 'ARMORY_SELL', 'ARMORY_UPGRADE', 'ADMIN_EDIT', 'ADMIN_GRANT', 'FORCE_CONTRIBUTION', 'ACCOUNT_RESET');

CREATE TYPE "ItemLedgerRunKind" AS ENUM ('BASELINE', 'CHECK');

CREATE TABLE "ItemLedgerRun" (
    "id" SERIAL NOT NULL,
    "dayKey" TEXT NOT NULL,
    "kind" "ItemLedgerRunKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemLedgerRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemLedgerEntry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "usage" "ItemUsage" NOT NULL,
    "level" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "ItemLedgerReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkRunId" INTEGER,

    CONSTRAINT "ItemLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemBalanceCheckpoint" (
    "userId" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "usage" "ItemUsage" NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ItemBalanceCheckpoint_pkey" PRIMARY KEY ("userId","type","usage","level")
);

CREATE TABLE "ItemLedgerMismatch" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "usage" "ItemUsage" NOT NULL,
    "level" INTEGER NOT NULL,
    "checkpointQuantity" INTEGER NOT NULL,
    "ledgerDelta" INTEGER NOT NULL,
    "actualQuantity" INTEGER NOT NULL,
    "drift" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemLedgerMismatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemLedgerRun_dayKey_key" ON "ItemLedgerRun"("dayKey");
CREATE INDEX "ItemLedgerEntry_checkRunId_idx" ON "ItemLedgerEntry"("checkRunId");
CREATE INDEX "ItemLedgerEntry_userId_createdAt_idx" ON "ItemLedgerEntry"("userId", "createdAt");
CREATE INDEX "ItemLedgerMismatch_createdAt_idx" ON "ItemLedgerMismatch"("createdAt");
CREATE INDEX "ItemLedgerMismatch_userId_idx" ON "ItemLedgerMismatch"("userId");

ALTER TABLE "ItemLedgerEntry" ADD CONSTRAINT "ItemLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemLedgerEntry" ADD CONSTRAINT "ItemLedgerEntry_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "ItemLedgerRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemBalanceCheckpoint" ADD CONSTRAINT "ItemBalanceCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemLedgerMismatch" ADD CONSTRAINT "ItemLedgerMismatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ItemLedgerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemLedgerMismatch" ADD CONSTRAINT "ItemLedgerMismatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same rule as every table since 20261029120000: no direct API access.
ALTER TABLE "ItemLedgerRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemBalanceCheckpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemLedgerMismatch" ENABLE ROW LEVEL SECURITY;
