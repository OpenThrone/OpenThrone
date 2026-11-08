-- Alliance era lifecycle (#13): every alliance carries an era-scoped status.
-- ADD COLUMN ... NOT NULL DEFAULT 'ACTIVE' backfills every existing alliance as
-- ACTIVE: they keep running until the next era rollover reserves them.
CREATE TYPE "AllianceStatus" AS ENUM ('ACTIVE', 'RESERVED');

ALTER TABLE "alliances" ADD COLUMN "status" "AllianceStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "alliances" ADD COLUMN "status_changed_at" TIMESTAMPTZ(6);
ALTER TABLE "alliances" ADD COLUMN "status_era_id" INTEGER;
ALTER TABLE "alliances" ADD COLUMN "status_changed_by" INTEGER;

-- Rollover, directories and every ACTIVE gate filter on the status.
CREATE INDEX "alliances_status_idx" ON "alliances"("status");
