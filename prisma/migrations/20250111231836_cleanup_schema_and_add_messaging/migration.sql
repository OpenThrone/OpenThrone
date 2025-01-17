/*
  Warnings:

  - You are about to alter the column `avatar` on the `alliances` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "type" SET DEFAULT '''PASSWORD''::text',
ALTER COLUMN "oldEmail" SET DEFAULT 'NULL';

-- AlterTable
ALTER TABLE "alliance_memberships" ADD COLUMN     "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "alliance_roles" ADD COLUMN     "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "permissions" JSON DEFAULT '{"invite_member": false, "grant_access": false, "edit_ranks": false, "send_messages": false, "edit_profile": false, "manage_allies": false, "manage_enemies": false, "edit_list": false, "view_list": false}',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "alliances" ADD COLUMN     "bannerimg" VARCHAR,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gold_in_bank" BIGINT DEFAULT 0,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "avatar" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "social" ALTER COLUMN "requestDate" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "acceptanceDate" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "endDate" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stats" JSONB,
ADD COLUMN     "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "defense" DROP NOT NULL,
ALTER COLUMN "defense_str" DROP NOT NULL,
ALTER COLUMN "killing_str" DROP NOT NULL,
ALTER COLUMN "offense" DROP NOT NULL,
ALTER COLUMN "sentry" DROP NOT NULL,
ALTER COLUMN "sentry_str" DROP NOT NULL,
ALTER COLUMN "spy" DROP NOT NULL,
ALTER COLUMN "spying_str" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AccountStatusHistory_user_id_start_date_idx" ON "AccountStatusHistory"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "attack_log_attacker_id_idx" ON "attack_log"("attacker_id");

-- CreateIndex
CREATE INDEX "attack_log_defender_id_idx" ON "attack_log"("defender_id");

-- CreateIndex
CREATE INDEX "attack_log_winner_idx" ON "attack_log"("winner");

-- CreateIndex
CREATE INDEX "idx_social_friendId" ON "social"("friendId");

-- CreateIndex
CREATE INDEX "idx_social_playerId" ON "social"("playerId");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- AddForeignKey
ALTER TABLE "social" ADD CONSTRAINT "social_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social" ADD CONSTRAINT "social_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "attack_log_attacker_defender_timestamp_idx" RENAME TO "attack_log_attacker_id_defender_id_timestamp_idx";

-- RenameIndex
ALTER INDEX "bank_history_from_to_date_idx" RENAME TO "bank_history_from_user_id_to_user_id_date_time_idx";

-- RenameIndex
ALTER INDEX "recruit_history_to_from_timestamp_idx" RENAME TO "recruit_history_to_user_from_user_timestamp_idx";
