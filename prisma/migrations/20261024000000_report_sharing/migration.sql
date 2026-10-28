-- Existing reports remain private. Public access is an explicit participant action.
ALTER TABLE "attack_log_acl" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;
-- Deduplicate identical grants before enforcing idempotent sharing.
DELETE FROM "attack_log_acl" a USING "attack_log_acl" b
WHERE a.id > b.id AND a.attack_log_id = b.attack_log_id
AND a.shared_with_user_id IS NOT DISTINCT FROM b.shared_with_user_id
AND a.shared_with_alliance_id IS NOT DISTINCT FROM b.shared_with_alliance_id;
CREATE UNIQUE INDEX "attack_log_acl_user_unique" ON "attack_log_acl" ("attack_log_id", "shared_with_user_id") WHERE "shared_with_user_id" IS NOT NULL;
CREATE UNIQUE INDEX "attack_log_acl_alliance_unique" ON "attack_log_acl" ("attack_log_id", "shared_with_alliance_id") WHERE "shared_with_alliance_id" IS NOT NULL;
CREATE UNIQUE INDEX "attack_log_acl_public_unique" ON "attack_log_acl" ("attack_log_id") WHERE "is_public";
