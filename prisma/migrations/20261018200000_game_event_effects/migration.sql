-- Game events (#86): era-bound events and the daily citizen bonus moved
-- from a server setting into an event that lasts until the era ends.

ALTER TABLE "GameEvent" ALTER COLUMN "endsAt" DROP NOT NULL;
ALTER TABLE "GameEvent" ADD COLUMN "eraId" INTEGER;
ALTER TABLE "GameEvent"
  ADD CONSTRAINT "GameEvent_eraId_fkey" FOREIGN KEY ("eraId")
  REFERENCES "Era"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "GameEvent_eraId_idx" ON "GameEvent"("eraId");

-- An event without an end time must be bound to an era.
ALTER TABLE "GameEvent"
  ADD CONSTRAINT "GameEvent_end_or_era_check"
  CHECK ("endsAt" IS NOT NULL OR "eraId" IS NOT NULL);

-- Carry a non-zero daily citizen bonus over as an active, era-bound event.
-- The setting value is JSON (a number, or a numeric string); the activity
-- window falls back to the old default of 24 hours.
WITH bonus AS (
  SELECT floor(("value" #>> '{}')::numeric)::int AS amount
  FROM "ServerSetting"
  WHERE "key" = 'era.dailyCitizenBonus'
    AND ("value" #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$'
),
hours AS (
  SELECT floor(("value" #>> '{}')::numeric)::int AS amount
  FROM "ServerSetting"
  WHERE "key" = 'era.dailyCitizenBonusActivityHours'
    AND ("value" #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$'
),
era AS (
  SELECT "id" FROM "Era" WHERE "endDate" IS NULL
  ORDER BY "startDate" DESC LIMIT 1
),
author AS (
  SELECT COALESCE(
    (SELECT "updatedByUserId" FROM "ServerSetting"
      WHERE "key" = 'era.dailyCitizenBonus' AND "updatedByUserId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "ServerSetting"."updatedByUserId")),
    (SELECT "id" FROM "users" WHERE "id" = 1),
    (SELECT min("id") FROM "users" WHERE "id" > 0)
  ) AS "id"
)
INSERT INTO "GameEvent"
  ("key", "name", "description", "type", "status", "startsAt", "endsAt",
   "eraId", "config", "createdByUserId", "activatedAt", "createdAt", "updatedAt")
SELECT
  'daily-citizen-bonus-era-' || era."id",
  'Daily citizen bonus',
  'Carried over from the former daily citizen bonus server setting.',
  'CUSTOM',
  'ACTIVE',
  now(),
  NULL,
  era."id",
  jsonb_build_object(
    'dailyCitizenBonus', LEAST(bonus.amount, 100000),
    'dailyCitizenActivityHours',
    LEAST(GREATEST(COALESCE((SELECT amount FROM hours), 24), 0), 720)
  ),
  author."id",
  now(),
  now(),
  now()
FROM bonus, era, author
WHERE bonus.amount > 0 AND author."id" IS NOT NULL
ON CONFLICT ("key") DO NOTHING;

DELETE FROM "ServerSetting"
WHERE "key" IN ('era.dailyCitizenBonus', 'era.dailyCitizenBonusActivityHours');
