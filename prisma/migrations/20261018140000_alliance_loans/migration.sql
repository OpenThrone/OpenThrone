-- Alliance treasury loans (#66 phase 3): additive only.
ALTER TYPE "AllianceTransactionType" ADD VALUE IF NOT EXISTS 'LOAN_REPAYMENT';

-- CreateEnum
CREATE TYPE "AllianceLoanStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'REPAID', 'DEFAULTED', 'WRITTEN_OFF', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "alliances" ADD COLUMN "loan_term_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "loan_interest_pct" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "member_daily_cap" BIGINT NOT NULL DEFAULT 5000000;

-- CreateTable
CREATE TABLE "alliance_loans" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "borrower_id" INTEGER NOT NULL,
    "principal" BIGINT NOT NULL,
    "interest_pct" INTEGER NOT NULL,
    "amount_owed" BIGINT NOT NULL,
    "amount_repaid" BIGINT NOT NULL DEFAULT 0,
    -- Repayments diverted from income while only the borrower is locked; moved
    -- into the treasury by settleLoanTreasuryCredits under the alliance lock.
    "pending_treasury_credit" BIGINT NOT NULL DEFAULT 0,
    "status" "AllianceLoanStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(200),
    "decided_by" INTEGER,
    "approved_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_loans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alliance_loans_alliance_id_status_idx" ON "alliance_loans"("alliance_id", "status");

-- CreateIndex
CREATE INDEX "alliance_loans_borrower_id_status_idx" ON "alliance_loans"("borrower_id", "status");

-- AddForeignKey
ALTER TABLE "alliance_loans" ADD CONSTRAINT "alliance_loans_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_loans" ADD CONSTRAINT "alliance_loans_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_loans" ADD CONSTRAINT "alliance_loans_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
