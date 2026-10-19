-- Alliance intel sharing and Hit/Farm/Recon calls (#66 phase 6). Additive only.
CREATE TYPE "AllianceCallType" AS ENUM ('HIT', 'FARM', 'RECON');
CREATE TYPE "AllianceCallStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "alliance_target_calls" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "call_type" "AllianceCallType" NOT NULL,
    "status" "AllianceCallStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(200),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "alliance_target_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alliance_intel_shares" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "attack_log_id" INTEGER NOT NULL,
    "shared_by" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "call_id" INTEGER,
    "is_threat" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_intel_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_alliance_calls_status" ON "alliance_target_calls"("alliance_id", "status", "created_at");
CREATE INDEX "idx_alliance_calls_target" ON "alliance_target_calls"("target_user_id");
CREATE UNIQUE INDEX "alliance_intel_shares_alliance_id_attack_log_id_key" ON "alliance_intel_shares"("alliance_id", "attack_log_id");
CREATE INDEX "idx_alliance_intel_feed" ON "alliance_intel_shares"("alliance_id", "created_at");
CREATE INDEX "idx_alliance_intel_call" ON "alliance_intel_shares"("call_id");

ALTER TABLE "alliance_target_calls" ADD CONSTRAINT "alliance_target_calls_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_target_calls" ADD CONSTRAINT "alliance_target_calls_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_intel_shares" ADD CONSTRAINT "alliance_intel_shares_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_intel_shares" ADD CONSTRAINT "alliance_intel_shares_attack_log_id_fkey" FOREIGN KEY ("attack_log_id") REFERENCES "attack_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_intel_shares" ADD CONSTRAINT "alliance_intel_shares_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "alliance_target_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
