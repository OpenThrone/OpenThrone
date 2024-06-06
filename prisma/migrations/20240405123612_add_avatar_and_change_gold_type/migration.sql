-- Alter the `gold_amount` column in `bank_history` table
ALTER TABLE bank_history
ALTER COLUMN gold_amount TYPE BIGINT USING gold_amount::BIGINT;

-- Alter the `gold` column in `users` table
ALTER TABLE users
ALTER COLUMN gold TYPE BIGINT USING gold::BIGINT;

-- Alter the `gold_in_bank` column in `users` table
ALTER TABLE users
ALTER COLUMN gold_in_bank TYPE BIGINT USING gold_in_bank::BIGINT;

-- Update the default value for `structure_upgrades` in `users` table
ALTER TABLE users
ALTER COLUMN structure_upgrades SET DEFAULT '[{"type": "OFFENSE", "level": 1}, {"type": "SPY", "level": 1}, {"type": "SENTRY", "level": 1}, {"type": "ARMORY", "level": 0}]';

-- Add the `avatar` column to the `users` table
ALTER TABLE users
ADD COLUMN avatar TEXT DEFAULT 'SHIELD';

ALTER TABLE bank_history 
ADD COLUMN "stats" JSONB DEFAULT '[]';