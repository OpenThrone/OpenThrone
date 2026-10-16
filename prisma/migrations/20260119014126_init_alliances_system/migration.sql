-- CreateEnum
CREATE TYPE "AllianceJoinMode" AS ENUM ('OPEN', 'REQUEST_TO_JOIN', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "AllianceRosterVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY');

-- CreateEnum
CREATE TYPE "WarStatus" AS ENUM ('WARMUP', 'ACTIVE', 'COOLDOWN', 'ENDED');

-- CreateEnum
CREATE TYPE "AllianceCooldownType" AS ENUM ('LEAVE', 'KICK');

-- CreateEnum
CREATE TYPE "AllianceTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TAX', 'FEE', 'LOAN');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "alliances" ADD COLUMN     "join_mode" "AllianceJoinMode" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "roster_visibility" "AllianceRosterVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "war_tax_mode" TEXT NOT NULL DEFAULT 'ALLIANCE',
ADD COLUMN     "war_tax_rate_default" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "alliance_wars" (
    "id" SERIAL NOT NULL,
    "attacker_alliance_id" INTEGER NOT NULL,
    "defender_alliance_id" INTEGER,
    "defender_user_id" INTEGER,
    "status" "WarStatus" NOT NULL DEFAULT 'WARMUP',
    "declared_by_user_id" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alliance_wars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "war_targets" (
    "id" SERIAL NOT NULL,
    "war_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "war_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_join_requests" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "moderated_by" INTEGER,

    CONSTRAINT "alliance_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_cooldowns" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "alliance_id" INTEGER,
    "type" "AllianceCooldownType" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_cooldowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_xp" (
    "alliance_id" INTEGER NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alliance_xp_pkey" PRIMARY KEY ("alliance_id")
);

-- CreateTable
CREATE TABLE "alliance_upgrades" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "upgrade_key" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "purchased_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_bank_history" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "transaction_type" "AllianceTransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "related_user_id" INTEGER,
    "performed_by_user_id" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_bank_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_fees" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "amount" BIGINT NOT NULL,
    "exempt_role_ids" JSONB DEFAULT '[]',
    "next_run_at" TIMESTAMPTZ(3),

    CONSTRAINT "alliance_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alliance_wars_attacker_alliance_id_idx" ON "alliance_wars"("attacker_alliance_id");

-- CreateIndex
CREATE INDEX "alliance_wars_defender_alliance_id_idx" ON "alliance_wars"("defender_alliance_id");

-- CreateIndex
CREATE INDEX "alliance_wars_status_idx" ON "alliance_wars"("status");

-- CreateIndex
CREATE INDEX "war_targets_war_id_idx" ON "war_targets"("war_id");

-- CreateIndex
CREATE INDEX "war_targets_target_user_id_idx" ON "war_targets"("target_user_id");

-- CreateIndex
CREATE INDEX "alliance_join_requests_alliance_id_idx" ON "alliance_join_requests"("alliance_id");

-- CreateIndex
CREATE INDEX "alliance_join_requests_user_id_idx" ON "alliance_join_requests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "alliance_join_requests_alliance_id_user_id_status_key" ON "alliance_join_requests"("alliance_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "alliance_cooldowns_user_id_idx" ON "alliance_cooldowns"("user_id");

-- CreateIndex
CREATE INDEX "alliance_cooldowns_alliance_id_idx" ON "alliance_cooldowns"("alliance_id");

-- CreateIndex
CREATE INDEX "alliance_upgrades_alliance_id_idx" ON "alliance_upgrades"("alliance_id");

-- CreateIndex
CREATE INDEX "alliance_bank_history_alliance_id_idx" ON "alliance_bank_history"("alliance_id");

-- CreateIndex
CREATE INDEX "alliance_bank_history_created_at_idx" ON "alliance_bank_history"("created_at");

-- CreateIndex
CREATE INDEX "alliance_fees_alliance_id_idx" ON "alliance_fees"("alliance_id");

-- AddForeignKey
ALTER TABLE "alliance_wars" ADD CONSTRAINT "alliance_wars_attacker_alliance_id_fkey" FOREIGN KEY ("attacker_alliance_id") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_wars" ADD CONSTRAINT "alliance_wars_defender_alliance_id_fkey" FOREIGN KEY ("defender_alliance_id") REFERENCES "alliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_wars" ADD CONSTRAINT "alliance_wars_defender_user_id_fkey" FOREIGN KEY ("defender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_wars" ADD CONSTRAINT "alliance_wars_declared_by_user_id_fkey" FOREIGN KEY ("declared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_targets" ADD CONSTRAINT "war_targets_war_id_fkey" FOREIGN KEY ("war_id") REFERENCES "alliance_wars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_targets" ADD CONSTRAINT "war_targets_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_join_requests" ADD CONSTRAINT "alliance_join_requests_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_join_requests" ADD CONSTRAINT "alliance_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_cooldowns" ADD CONSTRAINT "alliance_cooldowns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_cooldowns" ADD CONSTRAINT "alliance_cooldowns_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_xp" ADD CONSTRAINT "alliance_xp_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_upgrades" ADD CONSTRAINT "alliance_upgrades_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_bank_history" ADD CONSTRAINT "alliance_bank_history_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_bank_history" ADD CONSTRAINT "alliance_bank_history_related_user_id_fkey" FOREIGN KEY ("related_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_bank_history" ADD CONSTRAINT "alliance_bank_history_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_fees" ADD CONSTRAINT "alliance_fees_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
