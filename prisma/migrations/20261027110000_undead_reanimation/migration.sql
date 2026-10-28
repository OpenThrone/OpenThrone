-- Undead reanimation (#211, phase 5 of #205): the daily ledger of risen dead
-- on the users row. reanimation_day is the OT day key (YYYY-MM-DD) the ledger
-- was last reset for, exactly like the morale pass's kingdom_morale_day;
-- reanimation_cap is that day's cap, 2% of the trained combat army measured at
-- the player's first battle of the OT day; reanimated_today counts the units
-- that already rose, across all battles of that day. Excess is lost, never
-- carried over, and an era reset clears all three.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "reanimated_today" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "reanimation_day" TEXT;
ALTER TABLE "users" ADD COLUMN "reanimation_cap" INTEGER NOT NULL DEFAULT 0;
