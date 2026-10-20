-- Alliance rank hierarchy (#66): lower rank_order is a higher rank.
ALTER TABLE "alliance_roles" ADD COLUMN "rank_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill by id within each alliance, keeping the default "Member" role last
-- (it was created first, but every new member receives it, so it must rank lowest).
UPDATE "alliance_roles" AS r
SET "rank_order" = ranked.position
FROM (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY alliance_id
      ORDER BY (name = 'Member') ASC, id ASC
    ) - 1)::INTEGER AS position
  FROM "alliance_roles"
) AS ranked
WHERE r.id = ranked.id;
