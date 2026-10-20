-- Battle protection rework (#46): per-era join time and attack forfeiture.
-- Both columns are nullable and additive. era_joined_at is NULL for legacy rows;
-- the application falls back to max(era.startDate, created_at) in that case.
ALTER TABLE "users" ADD COLUMN "era_joined_at" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "protection_forfeited_era_id" INTEGER;
