-- CreateEnum
CREATE TYPE "ForceContractKind" AS ENUM ('MERCENARY', 'ALLIANCE');

-- CreateEnum
CREATE TYPE "ForceContractStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'EXPIRED', 'RECALLED', 'DISMISSED', 'DEPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ForceReserve" (
    "id" SERIAL NOT NULL,
    "allianceId" INTEGER NOT NULL,
    "type" "UnitType" NOT NULL,
    "level" INTEGER NOT NULL,
    "loadoutKey" VARCHAR(64) NOT NULL,
    "equipment" JSONB NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ForceReserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForceContract" (
    "id" SERIAL NOT NULL,
    "kind" "ForceContractKind" NOT NULL,
    "status" "ForceContractStatus" NOT NULL DEFAULT 'REQUESTED',
    "userId" INTEGER NOT NULL,
    "allianceId" INTEGER,
    "reserveId" INTEGER,
    "type" "UnitType" NOT NULL,
    "level" INTEGER NOT NULL,
    "equipment" JSONB NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "survivingQuantity" INTEGER NOT NULL,
    "termDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "pillageRateBps" INTEGER NOT NULL DEFAULT 0,
    "unitPriceGold" BIGINT NOT NULL DEFAULT 0,
    "policyVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ForceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForceEvent" (
    "id" SERIAL NOT NULL,
    "operationKey" VARCHAR(128) NOT NULL,
    "allianceId" INTEGER,
    "contractId" INTEGER,
    "actorId" INTEGER,
    "action" VARCHAR(40) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "gold" BIGINT NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceForcePolicy" (
    "id" SERIAL NOT NULL,
    "allianceId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceForcePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForceReserve_allianceId_type_level_loadoutKey_key" ON "ForceReserve"("allianceId", "type", "level", "loadoutKey");

-- CreateIndex
CREATE UNIQUE INDEX "ForceReserve_id_allianceId_key" ON "ForceReserve"("id", "allianceId");

-- CreateIndex
CREATE INDEX "ForceContract_userId_status_expiresAt_idx" ON "ForceContract"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ForceContract_allianceId_status_idx" ON "ForceContract"("allianceId", "status");

-- CreateIndex
CREATE INDEX "ForceContract_status_expiresAt_idx" ON "ForceContract"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForceEvent_operationKey_key" ON "ForceEvent"("operationKey");

-- CreateIndex
CREATE INDEX "ForceEvent_allianceId_createdAt_idx" ON "ForceEvent"("allianceId", "createdAt");

-- CreateIndex
CREATE INDEX "ForceEvent_contractId_createdAt_idx" ON "ForceEvent"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceForcePolicy_allianceId_version_key" ON "AllianceForcePolicy"("allianceId", "version");

-- AddForeignKey
ALTER TABLE "ForceReserve" ADD CONSTRAINT "ForceReserve_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_reserveId_allianceId_fkey" FOREIGN KEY ("reserveId", "allianceId") REFERENCES "ForceReserve"("id", "allianceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceEvent" ADD CONSTRAINT "ForceEvent_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceEvent" ADD CONSTRAINT "ForceEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ForceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceEvent" ADD CONSTRAINT "ForceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceForcePolicy" ADD CONSTRAINT "AllianceForcePolicy_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ownership and lifecycle invariants must also hold for non-application writers.
ALTER TABLE "ForceReserve" ADD CONSTRAINT "ForceReserve_valid_stock" CHECK (
  "available" BETWEEN 0 AND 1000000 AND "level" BETWEEN 1 AND 3
  AND "type" IN ('OFFENSE', 'DEFENSE', 'SPY', 'SENTRY')
  AND jsonb_typeof("equipment") = 'array'
);
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_valid_quantities" CHECK (
  "initialQuantity" BETWEEN 1 AND 1000000
  AND "survivingQuantity" BETWEEN 0 AND "initialQuantity"
  AND "level" BETWEEN 1 AND 3 AND "termDays" BETWEEN 1 AND 30
  AND "type" IN ('OFFENSE', 'DEFENSE', 'SPY', 'SENTRY')
  AND "pillageRateBps" BETWEEN 0 AND 2500 AND "unitPriceGold" >= 0
  AND jsonb_typeof("equipment") = 'array'
);
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_valid_owner" CHECK (
  ("kind" = 'MERCENARY' AND "allianceId" IS NULL AND "reserveId" IS NULL AND "policyVersion" IS NULL)
  OR ("kind" = 'ALLIANCE' AND "allianceId" IS NOT NULL AND "reserveId" IS NOT NULL AND "policyVersion" IS NOT NULL AND "policyVersion" > 0)
);
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_valid_lifecycle" CHECK (
  ("status" IN ('REQUESTED', 'CANCELLED') AND "startsAt" IS NULL AND "expiresAt" IS NULL
    AND (("status" = 'REQUESTED' AND "closedAt" IS NULL) OR ("status" = 'CANCELLED' AND "closedAt" IS NOT NULL)))
  OR ("status" = 'ACTIVE' AND "survivingQuantity" > 0 AND "startsAt" IS NOT NULL
    AND "expiresAt" IS NOT NULL AND "expiresAt" > "startsAt" AND "closedAt" IS NULL)
  OR ("status" IN ('EXPIRED', 'RECALLED', 'DISMISSED', 'DEPLETED') AND "startsAt" IS NOT NULL
    AND "expiresAt" IS NOT NULL AND "expiresAt" > "startsAt" AND "closedAt" IS NOT NULL AND "closedAt" >= "startsAt")
);
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_depleted" CHECK (
  "status" <> 'DEPLETED' OR "survivingQuantity" = 0
);
ALTER TABLE "ForceEvent" ADD CONSTRAINT "ForceEvent_nonnegative" CHECK ("quantity" >= 0 AND "gold" >= 0);
ALTER TABLE "AllianceForcePolicy" ADD CONSTRAINT "AllianceForcePolicy_positive_version" CHECK ("version" > 0 AND jsonb_typeof("settings") = 'object');

ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_terminal_kind" CHECK (
  ("status" <> 'RECALLED' OR "kind" = 'ALLIANCE')
  AND ("status" <> 'EXPIRED' OR "closedAt" >= "expiresAt")
);
ALTER TABLE "ForceContract" ADD CONSTRAINT "ForceContract_policy_fkey"
  FOREIGN KEY ("allianceId", "policyVersion") REFERENCES "AllianceForcePolicy"("allianceId", "version")
  ON DELETE RESTRICT ON UPDATE CASCADE;
