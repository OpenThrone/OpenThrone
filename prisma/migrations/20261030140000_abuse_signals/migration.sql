-- Abuse signals (#6): admin-only detection signals (shared network, resource
-- funnelling, bot-like timing, fresh-account farming). Signals raise a
-- CheatSignal for staff review; nothing here blocks or penalises a player.

ALTER TYPE "CheatSignalType" ADD VALUE 'RESOURCE_FUNNELLING';
ALTER TYPE "CheatSignalType" ADD VALUE 'BOT_TIMING';
ALTER TYPE "CheatSignalType" ADD VALUE 'FRESH_ACCOUNT_FARMING';

ALTER TABLE "CheatSignal"
  ADD COLUMN "reviewNote" VARCHAR(1000),
  ADD COLUMN "linkedUserIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "dedupeKey" TEXT;

CREATE INDEX "CheatSignal_type_dedupeKey_idx" ON "CheatSignal"("type", "dedupeKey");
CREATE INDEX "CheatSignal_linkedUserIds_idx" ON "CheatSignal" USING GIN ("linkedUserIds");

-- Per-player, per-UTC-day gameplay timing counters (no IP, device or content).
CREATE TABLE "ActivityDay" (
  "userId" INTEGER NOT NULL,
  "day" DATE NOT NULL,
  "hourMask" INTEGER NOT NULL DEFAULT 0,
  "actions" INTEGER NOT NULL DEFAULT 0,
  "gapCount" INTEGER NOT NULL DEFAULT 0,
  "gapSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gapSumSq" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ActivityDay_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "ActivityDay_day_idx" ON "ActivityDay"("day");

ALTER TABLE "ActivityDay"
  ADD CONSTRAINT "ActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every public table has row level security (see 20261029120000_enable_row_level_security).
ALTER TABLE "ActivityDay" ENABLE ROW LEVEL SECURITY;
