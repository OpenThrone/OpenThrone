-- Existing recruitment rewards went to the signed-in recruiter and remain internal.
CREATE TYPE "RecruitmentSource" AS ENUM ('INTERNAL', 'EXTERNAL');
ALTER TABLE "recruit_history" ADD COLUMN "source" "RecruitmentSource" NOT NULL DEFAULT 'INTERNAL';
CREATE INDEX "recruit_history_source_to_user_timestamp_idx" ON "recruit_history"("source", "to_user", "timestamp");
CREATE INDEX "recruit_history_source_to_user_ip_addr_timestamp_idx" ON "recruit_history"("source", "to_user", "ip_addr", "timestamp");
CREATE INDEX "recruit_history_source_ip_addr_timestamp_idx" ON "recruit_history"("source", "ip_addr", "timestamp");

-- The legacy recruit.dailyCap governed internal recruiting (it capped both
-- sides before this change). Carry the stored value to the new internal key
-- so the admin's live internal allowance survives, then reset the legacy key
-- to the external default so the old number cannot silently become the
-- anonymous link allowance.
INSERT INTO "ServerSetting" ("key", "label", "type", "value", "isPublic", "isRuntimeEditable", "createdAt", "updatedAt")
SELECT 'recruit.internalDailyCap',
       'Internal daily recruiting cap',
       'NUMBER',
       s."value",
       true,
       true,
       NOW(),
       NOW()
FROM "ServerSetting" s
WHERE s."key" = 'recruit.dailyCap'
ON CONFLICT ("key") DO NOTHING;

UPDATE "ServerSetting"
SET "value" = to_jsonb(25),
    "updatedAt" = NOW()
WHERE "key" = 'recruit.dailyCap';
