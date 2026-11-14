-- Alliance Hall levels (docs/decisions/alliance-hall-levels.md).
-- Existing alliances start at level 0 (Camp). No new table, so no RLS line.
ALTER TABLE "alliances" ADD COLUMN "hall_level" INTEGER NOT NULL DEFAULT 0;

-- Hall purchases are recorded in alliance_bank_history.
ALTER TYPE "AllianceTransactionType" ADD VALUE 'UPGRADE';
