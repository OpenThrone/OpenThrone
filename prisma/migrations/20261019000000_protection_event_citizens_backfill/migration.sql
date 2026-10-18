-- #97: the protection population limit is now starting citizens + 14 days of
-- (housing growth + recruiting cap); every citizen a game event hands out is
-- tracked in users.event_citizens_received and added on top, so events never
-- end protection. Until now the era-long daily citizen bonus (production's
-- 100/day setting, now an event) was projected into the limit instead of
-- counted, so credit what each player has received this era from the daily
-- update's history to keep everyone's protection unchanged on deploy.
WITH era AS (
  SELECT "startDate" FROM "Era" WHERE "endDate" IS NULL
  ORDER BY "startDate" DESC LIMIT 1
),
received AS (
  SELECT b."to_user_id" AS user_id,
         SUM(GREATEST(COALESCE((b."stats"->>'dailyCitizenBonus')::numeric, 0), 0))::int AS citizens
  FROM "bank_history" b
  JOIN "users" u ON u."id" = b."to_user_id"
  CROSS JOIN era
  WHERE b."history_type" = 'DAILY_RECRUIT'
    AND b."date_time" >= GREATEST(era."startDate", COALESCE(u."era_joined_at", era."startDate"))
    AND (b."stats"->>'dailyCitizenBonus') ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY b."to_user_id"
)
UPDATE "users" u
SET "event_citizens_received" = GREATEST(u."event_citizens_received", received.citizens)
FROM received
WHERE received.user_id = u."id";
