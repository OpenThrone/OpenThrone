-- Deprecate legacy ADMINISTRATOR and MODERATOR enum values from PermissionType.
-- All historical PermissionGrant rows with these values have been migrated to
-- StaffRoleAssignment in the previous migration. No active rows reference them.
-- The following block recreates the PermissionType enum without those legacy values.
BEGIN;
CREATE TYPE "PermissionType_new" AS ENUM (
  'VIEW_STAFF_DASHBOARD',
  'VIEW_AUDIT_LOGS',
  'MANAGE_USERS',
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
  'MANAGE_FEATURE_FLAGS',
  'MANAGE_SERVER_SETTINGS',
  'MANAGE_API_TOKENS',
  'USE_IMPERSONATION'
);
ALTER TABLE "PermissionGrant" ALTER COLUMN "type" TYPE "PermissionType_new" USING ("type"::text::"PermissionType_new");
ALTER TYPE "PermissionType" RENAME TO "PermissionType_old";
ALTER TYPE "PermissionType_new" RENAME TO "PermissionType";
DROP TYPE "public"."PermissionType_old";
COMMIT;
