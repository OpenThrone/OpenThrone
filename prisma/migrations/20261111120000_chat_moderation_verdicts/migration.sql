-- Shadow-mode chat moderation (#448). Measure only; verdicts are removed with
-- their message so chat retention and deletion also remove them.
CREATE TABLE "ChatModerationVerdict" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "roomType" VARCHAR(20) NOT NULL,
    "harassment" DOUBLE PRECISION,
    "severity" DOUBLE PRECISION,
    "spam" DOUBLE PRECISION,
    "recommendedAction" VARCHAR(20),
    "policyAction" VARCHAR(20) NOT NULL,
    "latencyMs" INTEGER,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewOutcome" VARCHAR(20),
    "reviewedByUserId" INTEGER,
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChatModerationVerdict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatModerationVerdict_messageId_provider_model_key" ON "ChatModerationVerdict"("messageId", "provider", "model");
CREATE INDEX "ChatModerationVerdict_createdAt_idx" ON "ChatModerationVerdict"("createdAt");
CREATE INDEX "ChatModerationVerdict_policyAction_createdAt_idx" ON "ChatModerationVerdict"("policyAction", "createdAt");

ALTER TABLE "ChatModerationVerdict" ADD CONSTRAINT "ChatModerationVerdict_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatModerationVerdict" ENABLE ROW LEVEL SECURITY;
