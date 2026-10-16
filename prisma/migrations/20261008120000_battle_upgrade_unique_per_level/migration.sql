-- Battle upgrades are owned per level (e.g. Steeds L1 and War Elephant L2 at the same time).
-- The previous (userId, type) key made buying a second level overwrite the first.
-- Existing rows already satisfy the wider key, so no data changes are needed.

-- DropIndex
DROP INDEX "UserBattleUpgrade_userId_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserBattleUpgrade_userId_type_level_key" ON "UserBattleUpgrade"("userId", "type", "level");
