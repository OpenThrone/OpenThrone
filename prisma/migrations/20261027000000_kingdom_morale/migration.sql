-- Kingdom morale (#205 phase 3): lasting morale stat, desertion floor and the
-- per-unit desertion ledger; powers population abandonment and defection.
ALTER TABLE "users" ADD COLUMN "kingdom_morale" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "users" ADD COLUMN "desertion_floor" INTEGER;
-- Idempotency marker for the daily morale pass: the OT day key (YYYY-MM-DD,
-- same key getOTDayKey derives for pressure resets) it last applied for, so a
-- retried or concurrent cron run is a no-op.
ALTER TABLE "users" ADD COLUMN "kingdom_morale_day" TEXT;

-- CreateEnum
CREATE TYPE "DesertionEventKind" AS ENUM ('ABANDON', 'DEFECT', 'CITIZENS', 'MERCENARY');

-- CreateTable
CREATE TABLE "DesertionEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eraId" INTEGER,
    "kind" "DesertionEventKind" NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "unitLevel" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "defectedToUserId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesertionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesertionEvent_userId_createdAt_idx" ON "DesertionEvent"("userId", "createdAt");
CREATE INDEX "DesertionEvent_defectedToUserId_createdAt_idx" ON "DesertionEvent"("defectedToUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "DesertionEvent" ADD CONSTRAINT "DesertionEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesertionEvent" ADD CONSTRAINT "DesertionEvent_defectedTo_fkey" FOREIGN KEY ("defectedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
