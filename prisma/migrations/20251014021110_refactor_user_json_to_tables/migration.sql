/*
  Warnings:

  - You are about to drop the column `battle_upgrades` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `bonus_points` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mercenaries` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `structure_upgrades` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `units` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('CITIZEN', 'WORKER', 'OFFENSE', 'DEFENSE', 'SPY', 'SENTRY');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD');

-- CreateEnum
CREATE TYPE "ItemUsage" AS ENUM ('OFFENSE', 'DEFENSE');

-- CreateEnum
CREATE TYPE "StructureUpgradeType" AS ENUM ('OFFENSE', 'SPY', 'SENTRY', 'ARMORY');

-- CreateEnum
CREATE TYPE "BattleUpgradeType" AS ENUM ('OFFENSE', 'SPY', 'SENTRY', 'DEFENSE');

-- CreateEnum
CREATE TYPE "BonusPointsType" AS ENUM ('OFFENSE', 'DEFENSE', 'INCOME', 'INTEL', 'PRICES');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "battle_upgrades",
DROP COLUMN "bonus_points",
DROP COLUMN "items",
DROP COLUMN "mercenaries",
DROP COLUMN "structure_upgrades",
DROP COLUMN "units",
ADD COLUMN     "battle_upgrades_json" JSONB DEFAULT '[{"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}]',
ADD COLUMN     "bonus_points_json" JSONB DEFAULT '[{"type": "OFFENSE", "level": 0}, {"type": "DEFENSE", "level": 0}, {"type": "INCOME", "level": 0}, {"type": "INTEL", "level": 0}, {"type": "PRICES", "level": 0}]',
ADD COLUMN     "items_json" JSONB DEFAULT '[{"type": "WEAPON", "level": 1, "usage": "OFFENSE", "quantity": 0}]',
ADD COLUMN     "mercenaries_json" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "structure_upgrades_json" JSONB DEFAULT '[{"type": "OFFENSE", "level": 1}, {"type": "SPY", "level": 1}, {"type": "SENTRY", "level": 1}, {"type": "ARMORY", "level": 1}]',
ADD COLUMN     "units_json" JSON DEFAULT '[{"type": "CITIZEN", "level": 1, "quantity": 50}, {"type": "WORKER", "level": 1, "quantity": 0}, {"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}]';

-- CreateTable
CREATE TABLE "UserUnit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "UnitType" NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isMercenary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "level" INTEGER NOT NULL,
    "usage" "ItemUsage" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStructureUpgrade" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "StructureUpgradeType" NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "UserStructureUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBattleUpgrade" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "BattleUpgradeType" NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "UserBattleUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBonusPoints" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "BonusPointsType" NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "UserBonusPoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserUnit_userId_idx" ON "UserUnit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserUnit_userId_type_isMercenary_key" ON "UserUnit"("userId", "type", "isMercenary");

-- CreateIndex
CREATE INDEX "UserItem_userId_idx" ON "UserItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserItem_userId_type_usage_key" ON "UserItem"("userId", "type", "usage");

-- CreateIndex
CREATE INDEX "UserStructureUpgrade_userId_idx" ON "UserStructureUpgrade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStructureUpgrade_userId_type_key" ON "UserStructureUpgrade"("userId", "type");

-- CreateIndex
CREATE INDEX "UserBattleUpgrade_userId_idx" ON "UserBattleUpgrade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBattleUpgrade_userId_type_key" ON "UserBattleUpgrade"("userId", "type");

-- CreateIndex
CREATE INDEX "UserBonusPoints_userId_idx" ON "UserBonusPoints"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBonusPoints_userId_type_key" ON "UserBonusPoints"("userId", "type");

-- AddForeignKey
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStructureUpgrade" ADD CONSTRAINT "UserStructureUpgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBattleUpgrade" ADD CONSTRAINT "UserBattleUpgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBonusPoints" ADD CONSTRAINT "UserBonusPoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
