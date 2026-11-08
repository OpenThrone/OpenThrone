-- Anti-camping battle XP (#334): when the player reached their current level.
-- Level derives from experience, so the column is set wherever a change of
-- experience moves the level. Existing players start the ramp fresh today;
-- new rows default to their creation time.
ALTER TABLE "users" ADD COLUMN "level_reached_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "users" SET "level_reached_at" = NOW() WHERE "level_reached_at" IS NULL;
