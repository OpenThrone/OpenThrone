-- AlterTable
ALTER TABLE "users" ADD COLUMN     "battle_upgrades" JSONB,
ADD COLUMN     "bonus_points" JSONB,
ADD COLUMN     "items" JSONB,
ADD COLUMN     "structure_upgrades" JSONB,
ADD COLUMN     "units" JSONB;
