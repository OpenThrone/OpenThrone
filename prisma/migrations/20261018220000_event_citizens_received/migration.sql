-- Citizens from timed citizen events and citizen multipliers this era (#89).
-- Added to the protection population limit; reset when a player joins an era.
-- Nothing to backfill: before #86 the only citizen bonus was the era-long
-- daily setting, which the limit already counts.
ALTER TABLE "users" ADD COLUMN "event_citizens_received" INTEGER NOT NULL DEFAULT 0;
