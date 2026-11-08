-- Discord DM outbox for supporter alerts and the daily digest.
CREATE TABLE "DiscordOutbox" (
    "id" SERIAL NOT NULL,
    "eventKey" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordOutbox_eventKey_key" ON "DiscordOutbox"("eventKey");
CREATE INDEX "DiscordOutbox_status_nextAttemptAt_idx" ON "DiscordOutbox"("status", "nextAttemptAt");
CREATE INDEX "DiscordOutbox_userId_idx" ON "DiscordOutbox"("userId");

ALTER TABLE "DiscordOutbox" ADD CONSTRAINT "DiscordOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
