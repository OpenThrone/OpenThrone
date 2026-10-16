/*
  Warnings:

  - A unique constraint covering the columns `[userId,type,usage,level]` on the table `UserItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserItem_userId_type_usage_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserItem_userId_type_usage_level_key" ON "UserItem"("userId", "type", "usage", "level");
