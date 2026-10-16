-- AlterTable
ALTER TABLE "users" ADD COLUMN     "items_json" JSONB DEFAULT '[]',
ADD COLUMN     "maxStamina" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "mercenaries_json" JSONB DEFAULT '[]',
ADD COLUMN     "stamina" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "units_json" JSONB DEFAULT '[]';
