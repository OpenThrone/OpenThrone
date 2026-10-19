-- Feature Flags and Server Settings stored the same switches in two tables,
-- and a flag row silently overrode the setting. Server settings are now the
-- only source: copy each flag's effective value into its setting, then drop
-- the flag rows so nothing can override settings again.
INSERT INTO "ServerSetting" ("key", "label", "type", "value", "isPublic", "isRuntimeEditable", "updatedByUserId", "createdAt", "updatedAt")
SELECT f."key",
       CASE f."key"
         WHEN 'ENABLE_ATTACKING' THEN 'Attacking'
         WHEN 'ENABLE_INFILTRATIONS' THEN 'Infiltrations'
         WHEN 'ENABLE_ASSASSINATIONS' THEN 'Assassinations'
         WHEN 'ENABLE_INTEL' THEN 'Intel'
         WHEN 'ENABLE_SOCIAL' THEN 'Social'
         WHEN 'ENABLE_MESSAGING' THEN 'Player messaging'
         WHEN 'ENABLE_ENEMIES' THEN 'Enemies'
         WHEN 'DISABLE_LOGIN' THEN 'Disable login'
         WHEN 'DISABLE_REGISTRATION' THEN 'Disable registration'
       END,
       'BOOLEAN',
       to_jsonb(f."enabled"),
       true,
       true,
       f."updatedByUserId",
       NOW(),
       NOW()
FROM "FeatureFlag" f
WHERE f."key" IN ('ENABLE_ATTACKING', 'ENABLE_INFILTRATIONS', 'ENABLE_ASSASSINATIONS', 'ENABLE_INTEL', 'ENABLE_SOCIAL', 'ENABLE_MESSAGING', 'ENABLE_ENEMIES', 'DISABLE_LOGIN', 'DISABLE_REGISTRATION')
ON CONFLICT ("key") DO UPDATE
  SET "value" = EXCLUDED."value",
      "updatedByUserId" = COALESCE(EXCLUDED."updatedByUserId", "ServerSetting"."updatedByUserId"),
      "updatedAt" = NOW();

DELETE FROM "FeatureFlag"
WHERE "key" IN ('ENABLE_ATTACKING', 'ENABLE_INFILTRATIONS', 'ENABLE_ASSASSINATIONS', 'ENABLE_INTEL', 'ENABLE_SOCIAL', 'ENABLE_MESSAGING', 'ENABLE_ENEMIES', 'DISABLE_LOGIN', 'DISABLE_REGISTRATION');
