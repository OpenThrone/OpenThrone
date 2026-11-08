CREATE TABLE "SupporterPlanPrice" (
  "planId" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "providerPriceId" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedById" INTEGER,
  CONSTRAINT "SupporterPlanPrice_pkey" PRIMARY KEY ("planId"),
  CONSTRAINT "SupporterPlanPrice_amount_check" CHECK ("priceCents" BETWEEN 100 AND 100000),
  CONSTRAINT "SupporterPlanPrice_currency_check" CHECK ("currency" = 'usd')
);
