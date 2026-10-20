-- Alliance treasury gold requests (#66 phase 2). Additive only.
-- CreateEnum
CREATE TYPE "AllianceGoldRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "alliance_gold_requests" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" VARCHAR(200),
    "status" "AllianceGoldRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" INTEGER,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_gold_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alliance_gold_requests_alliance_id_status_idx" ON "alliance_gold_requests"("alliance_id", "status");

-- CreateIndex
CREATE INDEX "alliance_gold_requests_requester_id_status_idx" ON "alliance_gold_requests"("requester_id", "status");

-- AddForeignKey
ALTER TABLE "alliance_gold_requests" ADD CONSTRAINT "alliance_gold_requests_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_gold_requests" ADD CONSTRAINT "alliance_gold_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_gold_requests" ADD CONSTRAINT "alliance_gold_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
