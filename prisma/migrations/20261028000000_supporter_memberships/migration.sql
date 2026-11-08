-- CreateEnum
CREATE TYPE "SupporterTier" AS ENUM ('SUPPORTER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('SUBSCRIPTION', 'ONE_TIME', 'GIFT', 'COMP');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'ONE_TIME', 'GIFT', 'ALLIANCE_SPONSORSHIP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterEnum
ALTER TYPE "PermissionType" ADD VALUE 'MANAGE_SUPPORTERS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "supporter_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "SupporterMembership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tier" "SupporterTier" NOT NULL DEFAULT 'SUPPORTER',
    "status" "MembershipStatus" NOT NULL,
    "source" "MembershipSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "badgeVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SupporterMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "allianceId" INTEGER,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerInvoiceId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "summary" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCode" (
    "id" SERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "purchaserUserId" INTEGER NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "recipientUserId" INTEGER,
    "redeemedByUserId" INTEGER,
    "redeemedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceSponsorship" (
    "id" SERIAL NOT NULL,
    "allianceId" INTEGER NOT NULL,
    "poolCents" INTEGER NOT NULL DEFAULT 0,
    "activeUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AllianceSponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLink" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifyPrefs" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DiscordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLinkCode" (
    "id" SERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DiscordLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupporterMembership_userId_key" ON "SupporterMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCode_codeHash_key" ON "GiftCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceSponsorship_allianceId_key" ON "AllianceSponsorship"("allianceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_userId_key" ON "DiscordLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_discordUserId_key" ON "DiscordLink"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLinkCode_codeHash_key" ON "DiscordLinkCode"("codeHash");

-- AddForeignKey
ALTER TABLE "SupporterMembership" ADD CONSTRAINT "SupporterMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCode" ADD CONSTRAINT "GiftCode_purchaserUserId_fkey" FOREIGN KEY ("purchaserUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCode" ADD CONSTRAINT "GiftCode_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCode" ADD CONSTRAINT "GiftCode_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCode" ADD CONSTRAINT "GiftCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceSponsorship" ADD CONSTRAINT "AllianceSponsorship_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordLink" ADD CONSTRAINT "DiscordLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordLinkCode" ADD CONSTRAINT "DiscordLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
