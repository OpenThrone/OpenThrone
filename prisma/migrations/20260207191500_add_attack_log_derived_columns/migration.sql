-- AlterTable
ALTER TABLE "attack_log"
ADD COLUMN "pillaged_gold" BIGINT,
ADD COLUMN "attacker_losses_total" INTEGER,
ADD COLUMN "defender_losses_total" INTEGER;

-- CreateIndex
CREATE INDEX "attack_log_type_timestamp_idx" ON "attack_log"("type", "timestamp");
