-- Refunds and disputes remove only the access a payment bought.
ALTER TABLE "Payment" ADD COLUMN "accessFrom" TIMESTAMPTZ(3),
  ADD COLUMN "accessUntil" TIMESTAMPTZ(3),
  ADD COLUMN "disputeRemovedSeconds" INTEGER,
  ADD COLUMN "billingCountry" TEXT,
  ADD COLUMN "billingState" TEXT,
  DROP COLUMN "disputeRevokedUntil";

-- Gift codes: null means never expires. Codes sold before this change
-- (test mode only) become non-expiring, the most generous reading.
ALTER TABLE "GiftCode" ALTER COLUMN "expiresAt" DROP NOT NULL;
UPDATE "GiftCode" SET "expiresAt" = NULL;

CREATE TABLE "PurchaseConsent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "allianceId" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "locale" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseConsent_checkoutSessionId_key" ON "PurchaseConsent"("checkoutSessionId");
CREATE INDEX "PurchaseConsent_userId_acceptedAt_idx" ON "PurchaseConsent"("userId", "acceptedAt");
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
