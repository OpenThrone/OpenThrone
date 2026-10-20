-- Alliance invitations (QA release #83). Invitations reuse the join-request
-- table: kind = 'REQUEST' (player asked) or 'INVITE' (alliance asked).
ALTER TABLE "alliance_join_requests"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'REQUEST',
  ADD COLUMN "invited_by" INTEGER;

-- The old unique (alliance, user, status) allowed only one APPROVED or
-- REJECTED row per player and alliance, so a second rejection or a re-join
-- after leaving failed. Only one *pending* row per player and alliance is
-- what we need.
DROP INDEX IF EXISTS "alliance_join_requests_alliance_id_user_id_status_key";
CREATE UNIQUE INDEX "alliance_join_requests_one_pending"
  ON "alliance_join_requests" ("alliance_id", "user_id")
  WHERE "status" = 'PENDING';
