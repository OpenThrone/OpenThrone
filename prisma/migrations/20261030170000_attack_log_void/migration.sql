-- Admin void of a battle with compensation (#229). The battle log is never
-- rewritten: a void adds display fields plus one AttackLogVoid record whose
-- unique attackLogId guarantees a battle is voided at most once.
ALTER TABLE "attack_log" ADD COLUMN "voidedAt" TIMESTAMPTZ(3),
ADD COLUMN "voidedById" INTEGER,
ADD COLUMN "voidReason" VARCHAR(500);

CREATE TABLE "AttackLogVoid" (
    "id" SERIAL NOT NULL,
    "attackLogId" INTEGER,
    "battleId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "planHash" VARCHAR(64) NOT NULL,
    "goldMode" VARCHAR(16) NOT NULL,
    "ledger" JSONB NOT NULL,
    "shortfalls" JSONB NOT NULL,
    "notReversed" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttackLogVoid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttackLogVoid_attackLogId_key" ON "AttackLogVoid"("attackLogId");
CREATE INDEX "AttackLogVoid_createdAt_idx" ON "AttackLogVoid"("createdAt");

ALTER TABLE "AttackLogVoid" ADD CONSTRAINT "AttackLogVoid_attackLogId_fkey" FOREIGN KEY ("attackLogId") REFERENCES "attack_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every table has RLS (see 20261029120000_enable_row_level_security).
ALTER TABLE "AttackLogVoid" ENABLE ROW LEVEL SECURITY;
