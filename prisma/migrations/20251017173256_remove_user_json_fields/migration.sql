-- CreateMigration 20251017173256 remove-user-json-fields
-- Drop deprecated JSON fields from users table

-- Drop the units_json column
ALTER TABLE "users" DROP COLUMN IF EXISTS "units_json";

-- Drop the mercenaries_json column  
ALTER TABLE "users" DROP COLUMN IF EXISTS "mercenaries_json";

-- Drop the items_json column
ALTER TABLE "users" DROP COLUMN IF EXISTS "items_json";