/*
  Warnings:

  - You are about to drop the column `battle_upgrades_json` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `bonus_points_json` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `items_json` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mercenaries_json` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `structure_upgrades_json` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `units_json` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "battle_upgrades_json",
DROP COLUMN "bonus_points_json",
DROP COLUMN "items_json",
DROP COLUMN "mercenaries_json",
DROP COLUMN "structure_upgrades_json",
DROP COLUMN "units_json";
