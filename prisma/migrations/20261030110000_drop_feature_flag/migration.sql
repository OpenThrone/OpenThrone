-- Drop the unused FeatureFlag model and table (issue #229). Feature flags
-- were replaced by ServerSetting rows: RuntimeConfig.service reads settings
-- only, and no production code reads or writes FeatureFlag.
--
-- Also remove the unused MANAGE_FEATURE_FLAGS permission value. No code,
-- nav item or role preset other than the ADMINISTRATOR catch-all
-- (Object.values(PermissionType)) references it, so any grant of it is a
-- dead capability; grants are deleted before the enum is recreated
-- (Postgres cannot drop a single enum value; same type-recreate pattern as
-- 20260604020000_deprecate_legacy_permissions).
BEGIN;

DROP TABLE "FeatureFlag";

DELETE FROM "PermissionGrant" WHERE "type"::text = 'MANAGE_FEATURE_FLAGS';

CREATE TYPE "PermissionType_new" AS ENUM (
  'VIEW_STAFF_DASHBOARD',
  'VIEW_AUDIT_LOGS',
  'MANAGE_USERS',
  'MANAGE_SUPPORTERS',
  'MANAGE_ACCOUNT_STATUS',
  'MANAGE_MODERATOR_NOTES',
  'MANAGE_BAN_APPEALS',
  'REVIEW_REPORTS',
  'ASSIGN_REPORTS',
  'MODERATE_CHAT',
  'VIEW_CHAT_LOGS',
  'MANAGE_ANNOUNCEMENTS',
  'MANAGE_CONTENT',
  'SEND_MASS_MESSAGES',
  'MANAGE_EVENTS',
  'MANAGE_ERAS',
  'MANAGE_ALLIANCES',
  'VIEW_ECONOMY',
  'VIEW_ANALYTICS',
  'VIEW_MULTI_ACCOUNTS',
  'VIEW_CHEAT_SIGNALS',
  'MANAGE_SERVER_SETTINGS',
  'MANAGE_API_TOKENS',
  'USE_IMPERSONATION'
);
ALTER TABLE "PermissionGrant" ALTER COLUMN "type" TYPE "PermissionType_new" USING ("type"::text::"PermissionType_new");
ALTER TYPE "PermissionType" RENAME TO "PermissionType_old";
ALTER TYPE "PermissionType_new" RENAME TO "PermissionType";
DROP TYPE "public"."PermissionType_old";

COMMIT;
