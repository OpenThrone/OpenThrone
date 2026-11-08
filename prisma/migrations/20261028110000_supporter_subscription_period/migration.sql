ALTER TABLE "SupporterMembership" ADD COLUMN "subscriptionPeriodEnd" TIMESTAMPTZ(3);
UPDATE "SupporterMembership"
SET "subscriptionPeriodEnd" = "currentPeriodEnd"
WHERE "source" = 'SUBSCRIPTION';
