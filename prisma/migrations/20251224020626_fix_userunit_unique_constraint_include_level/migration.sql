/*
  Warnings:

  - A unique constraint covering the columns `[userId,type,level,isMercenary]` on the table `UserUnit` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserUnit_userId_type_isMercenary_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserUnit_userId_type_level_isMercenary_key" ON "UserUnit"("userId", "type", "level", "isMercenary");
