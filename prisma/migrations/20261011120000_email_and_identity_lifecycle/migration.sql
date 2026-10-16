-- Email delivery and retained identity foundation.
CREATE TYPE "EmailCampaignKind" AS ENUM ('BROADCAST', 'NEWS', 'INACTIVITY_NOTICE', 'INACTIVITY_REMINDER');
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'NEWS', 'ANNOUNCEMENT', 'ACCOUNT_LIFECYCLE');
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "EmailSuppressionReason" AS ENUM ('UNSUBSCRIBED', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL');
CREATE TYPE "IdentityBlockKind" AS ENUM ('EMAIL', 'DISPLAY_NAME');
CREATE TYPE "IdentityBlockReason" AS ENUM ('SANCTION', 'DELETION_COOLDOWN', 'RESERVED_NAME');

CREATE TABLE "EmailPreference" (
    "userId" INTEGER NOT NULL,
    "newsEmails" BOOLEAN NOT NULL DEFAULT true,
    "announcementEmails" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAllAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "EmailCampaign" (
    "id" SERIAL NOT NULL,
    "kind" "EmailCampaignKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "blogPostId" INTEGER,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutbox" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER,
    "userId" INTEGER,
    "toAddress" TEXT NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "locale" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "headers" JSONB,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailSuppression" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,
    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountInactivityNotice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "warnedAt" TIMESTAMPTZ(3) NOT NULL,
    "reminderSentAt" TIMESTAMPTZ(3),
    "scheduledDeletionAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastActiveAtWarning" TIMESTAMPTZ(3),
    "createdByUserId" INTEGER,
    CONSTRAINT "AccountInactivityNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdentityBlock" (
    "id" SERIAL NOT NULL,
    "kind" "IdentityBlockKind" NOT NULL,
    "hash" TEXT NOT NULL,
    "reason" "IdentityBlockReason" NOT NULL,
    "sourceUserId" INTEGER,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentityBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailCampaign_kind_blogPostId_key" ON "EmailCampaign"("kind", "blogPostId");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "EmailOutbox_campaignId_userId_key" ON "EmailOutbox"("campaignId", "userId");
CREATE UNIQUE INDEX "EmailSuppression_hash_key" ON "EmailSuppression"("hash");
CREATE UNIQUE INDEX "AccountInactivityNotice_userId_key" ON "AccountInactivityNotice"("userId");
CREATE INDEX "AccountInactivityNotice_scheduledDeletionAt_idx" ON "AccountInactivityNotice"("scheduledDeletionAt");
CREATE UNIQUE INDEX "IdentityBlock_kind_hash_key" ON "IdentityBlock"("kind", "hash");

ALTER TABLE "EmailPreference" ADD CONSTRAINT "EmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountInactivityNotice" ADD CONSTRAINT "AccountInactivityNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountInactivityNotice" ADD CONSTRAINT "AccountInactivityNotice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdentityBlock" ADD CONSTRAINT "IdentityBlock_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- forgetAccount is the only non-idempotency writer, and accepts custom deletion
-- reasons. src/middleware/idempotency.ts writes reasons prefixed IDEMPOTENCY:.
-- Old hashes use the legacy salt scheme and cannot be converted without email
-- plaintext. Shared hashing lookups must check both legacyEmailHash(email) and
-- hashIdentity('EMAIL', email) during the 30-day transition.
-- AntiAbuseShadow does not retain a source user ID, so leave sourceUserId null.
INSERT INTO "IdentityBlock" ("kind", "hash", "reason", "expiresAt", "createdAt")
SELECT 'EMAIL'::"IdentityBlockKind", "hash",
       'DELETION_COOLDOWN'::"IdentityBlockReason",
       LEAST("expiresAt", now() + interval '30 days'), "createdAt"
FROM "AntiAbuseShadow"
WHERE "reason" IS NULL OR "reason" NOT LIKE 'IDEMPOTENCY:%'
ON CONFLICT ("kind", "hash") DO NOTHING;
