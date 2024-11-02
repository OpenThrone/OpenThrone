


CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'VACATION', 'CLOSED', 'IDLE', 'RESET', 'BANNED', 'TIMEOUT', 'SUSPENDED');

CREATE TABLE "AccountStatusHistory" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" "AccountStatus" NOT NULL,
  "start_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "end_date" TIMESTAMP,
  "reason" TEXT,
  "admin_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DropForeignKey
ALTER TABLE "AutoRecruitSession" DROP CONSTRAINT "AutoRecruitSession_userId_fkey";

-- DropIndex
DROP INDEX "recruit_history_from_user_idx";

-- AlterTable
ALTER TABLE "AutoRecruitSession" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "lastActivityAt" DROP DEFAULT,
ALTER COLUMN "lastActivityAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "type" SET NOT NULL;

-- AlterTable
ALTER TABLE "alliances" 
ALTER COLUMN "closed_enrollment" SET NOT NULL,
ALTER COLUMN "is_public" SET NOT NULL,
ALTER COLUMN "require_auth" SET NOT NULL;

-- AlterTable
ALTER TABLE "recruit_history" ADD COLUMN     "usersId" INTEGER;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "fort_hitpoints" SET DEFAULT 50,
ALTER COLUMN "attack_turns" SET DEFAULT 50,
ALTER COLUMN "battle_upgrades" SET DEFAULT '[{"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}]',
ALTER COLUMN "bonus_points" SET DEFAULT '[{"type": "OFFENSE", "level":0}, {"type": "DEFENSE", "level":0}, {"type": "INCOME", "level":0}, {"type": "INTEL", "level":0}, {"type": "PRICES", "level":0}]';

-- CreateTable
CREATE TABLE "AccountResetHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "resetDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "newUserId" INTEGER,
    "reason" TEXT,

    CONSTRAINT "AccountResetHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountResetHistory_userId_resetDate_idx" ON "AccountResetHistory"("userId", "resetDate");

-- AddForeignKey
ALTER TABLE "AccountResetHistory" ADD CONSTRAINT "AccountResetHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountResetHistory" ADD CONSTRAINT "AccountResetHistory_newUserId_fkey" FOREIGN KEY ("newUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruit_history" ADD CONSTRAINT "recruit_history_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruit_history" ADD CONSTRAINT "recruit_history_usersId_fkey" FOREIGN KEY ("usersId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoRecruitSession" ADD CONSTRAINT "AutoRecruitSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "social" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "friendId" INTEGER NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptanceDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'requested',

    CONSTRAINT "social_pkey" PRIMARY KEY ("id")
);