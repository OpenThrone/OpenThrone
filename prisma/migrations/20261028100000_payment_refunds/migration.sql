CREATE TABLE "PaymentRefund" (
    "id" SERIAL PRIMARY KEY,
    "paymentId" INTEGER NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "providerRefundId" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PaymentRefund_providerRefundId_key" ON "PaymentRefund"("providerRefundId");
CREATE INDEX "PaymentRefund_createdAt_idx" ON "PaymentRefund"("createdAt");
-- Payment has no updatedAt; use creation time as the best available estimate.
INSERT INTO "PaymentRefund" ("paymentId", "amountCents", "reason", "createdAt")
SELECT "id", "refundedCents", 'Legacy refund (date estimated)', "createdAt"
FROM "Payment" WHERE "refundedCents" > 0;
