ALTER TABLE "alliances" DROP CONSTRAINT IF EXISTS "alliances_usersId_fkey";
ALTER TABLE "alliances" DROP COLUMN IF EXISTS "usersId";

ALTER TABLE "alliances" ADD COLUMN "avatar" TEXT;
ALTER TABLE "alliances" ADD COLUMN "closed_enrollment" BOOLEAN DEFAULT false;
ALTER TABLE "alliances" ADD COLUMN "comments" TEXT;
ALTER TABLE "alliances" ADD COLUMN "is_public" BOOLEAN DEFAULT true;
ALTER TABLE "alliances" ADD COLUMN "motto" TEXT;
ALTER TABLE "alliances" ADD COLUMN "require_auth" BOOLEAN DEFAULT false;

-- Changed `attack_log` table
CREATE INDEX "attack_log_attacker_defender_timestamp_idx" ON "attack_log" ("attacker_id", "defender_id", "timestamp");

-- Changed `bank_history` table
CREATE INDEX "bank_history_from_to_date_idx" ON "bank_history" ("from_user_id", "to_user_id", "date_time");

-- Changed `recruit_history` table
CREATE INDEX "recruit_history_from_user_idx" ON "recruit_history" ("from_user");
CREATE INDEX "recruit_history_to_from_timestamp_idx" ON "recruit_history" ("to_user", "from_user", "timestamp");

-- Changed `users` table
ALTER TABLE "users" ALTER COLUMN "structure_upgrades" SET DEFAULT '[{"type": "OFFENSE", "level": 1}, {"type": "SPY", "level": 1}, {"type": "SENTRY", "level": 1}, {"type":"ARMORY","level":1}]';

DROP TRIGGER IF EXISTS update_alliances_updated_at ON "alliances";
CREATE TRIGGER update_alliances_updated_at
BEFORE UPDATE ON "alliances"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();