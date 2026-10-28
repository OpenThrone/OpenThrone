-- Dungeon captives (#210, #205 phase 4): the captive rows a dungeon holds
-- and the ledger of captures, ransoms, releases, conversions and escapes.
-- Ransom/release/convert events carry the caller's operationId (unique) so a
-- retried command replays instead of double-charging. A captive stack always
-- holds at least one unit: a non-positive quantity could otherwise mint gold
-- through a negative ransom price.

-- CreateEnum
CREATE TYPE "CaptiveEventKind" AS ENUM ('CAPTURED', 'RANSOMED', 'RELEASED', 'CONVERTED', 'ESCAPED');

-- CreateTable
CREATE TABLE "Captive" (
    "id" SERIAL NOT NULL,
    "captorId" INTEGER NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "unitLevel" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "eraId" INTEGER,

    CONSTRAINT "Captive_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Captive_quantity_check" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE INDEX "Captive_captorId_eraId_idx" ON "Captive"("captorId", "eraId");
CREATE INDEX "Captive_sourceId_eraId_idx" ON "Captive"("sourceId", "eraId");
CREATE INDEX "Captive_capturedAt_idx" ON "Captive"("capturedAt");

-- AddForeignKey
ALTER TABLE "Captive" ADD CONSTRAINT "Captive_captor_fkey" FOREIGN KEY ("captorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Captive" ADD CONSTRAINT "Captive_source_fkey" FOREIGN KEY ("sourceId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CaptiveEvent" (
    "id" SERIAL NOT NULL,
    "captorId" INTEGER NOT NULL,
    "sourceId" INTEGER,
    "eraId" INTEGER,
    "kind" "CaptiveEventKind" NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "unitLevel" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "gold" BIGINT NOT NULL DEFAULT 0,
    "operationKey" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaptiveEvent_operationKey_key" ON "CaptiveEvent"("operationKey");
CREATE INDEX "CaptiveEvent_captorId_createdAt_idx" ON "CaptiveEvent"("captorId", "createdAt");
CREATE INDEX "CaptiveEvent_sourceId_createdAt_idx" ON "CaptiveEvent"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaptiveEvent" ADD CONSTRAINT "CaptiveEvent_captor_fkey" FOREIGN KEY ("captorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaptiveEvent" ADD CONSTRAINT "CaptiveEvent_source_fkey" FOREIGN KEY ("sourceId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
