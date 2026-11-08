-- Privacy self-service: erasure requests with a grace period, and an export log.
-- Marks erased accounts; players cannot set it (an email address they can).
ALTER TABLE "users" ADD COLUMN "anonymizedAt" TIMESTAMPTZ(3);
CREATE INDEX "users_anonymizedAt_idx" ON "users"("anonymizedAt");

-- Accounts erased before this migration carry the exact address the erasure
-- scrub writes; mark them with the time of their ACCOUNT_ANONYMIZED audit row.
UPDATE "users" u SET "anonymizedAt" = COALESCE((SELECT min(a."timestamp") FROM "AuditLog" a WHERE a."action" = 'ACCOUNT_ANONYMIZED' AND a."targetUserId" = u.id), CURRENT_TIMESTAMP) WHERE u."email" = u.id::text || '-deleted@deleted.local';

CREATE TYPE "ErasureRequestStatus" AS ENUM ('AWAITING_CONFIRMATION', 'PENDING', 'CANCELLED', 'COMPLETED', 'EXPIRED');

CREATE TABLE "AccountErasureRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "ErasureRequestStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "scheduledFor" TIMESTAMPTZ(3),
    "closedStatusId" INTEGER,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledBy" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "userReason" TEXT,
    "expeditedByUserId" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "billingStopped" BOOLEAN NOT NULL DEFAULT false,
    "openedByUserId" INTEGER,

    CONSTRAINT "AccountErasureRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountDataExport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "byteSize" INTEGER,
    "sections" INTEGER,

    CONSTRAINT "AccountDataExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountErasureRequest_tokenHash_key" ON "AccountErasureRequest"("tokenHash");
CREATE INDEX "AccountErasureRequest_userId_status_idx" ON "AccountErasureRequest"("userId", "status");
CREATE INDEX "AccountErasureRequest_status_scheduledFor_idx" ON "AccountErasureRequest"("status", "scheduledFor");
CREATE INDEX "AccountDataExport_userId_requestedAt_idx" ON "AccountDataExport"("userId", "requestedAt");
CREATE INDEX "AccountDataExport_requestedAt_idx" ON "AccountDataExport"("requestedAt");

ALTER TABLE "AccountErasureRequest" ADD CONSTRAINT "AccountErasureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountErasureRequest" ADD CONSTRAINT "AccountErasureRequest_expeditedByUserId_fkey" FOREIGN KEY ("expeditedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountDataExport" ADD CONSTRAINT "AccountDataExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one live request per player; a second one would race the first.
CREATE UNIQUE INDEX "AccountErasureRequest_one_open_per_user" ON "AccountErasureRequest"("userId") WHERE "status" IN ('AWAITING_CONFIRMATION', 'PENDING');

ALTER TABLE "AccountErasureRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountDataExport" ENABLE ROW LEVEL SECURITY;
