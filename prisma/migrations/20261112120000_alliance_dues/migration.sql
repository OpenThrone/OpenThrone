-- Alliance join fee and recurring dues (docs/decisions/alliance-join-fee-and-dues.md).
-- Every existing alliance starts with no fee and no dues, and every existing
-- membership owes nothing. No new table, so no RLS line.
CREATE TYPE "AllianceDuesPeriod" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "alliances"
  ADD COLUMN "join_fee" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "dues_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "dues_period" "AllianceDuesPeriod" NOT NULL DEFAULT 'NONE';

ALTER TABLE "alliance_memberships"
  ADD COLUMN "dues_arrears" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "dues_paid_through" TIMESTAMPTZ(6);
