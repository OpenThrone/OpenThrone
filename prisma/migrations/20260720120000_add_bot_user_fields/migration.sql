-- Add bot user system fields
-- See .sisyphus/plans/bot-users-system.md for context.
ALTER TABLE "users" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "botPersona" TEXT;
ALTER TABLE "users" ADD COLUMN "botConfig" JSONB;
ALTER TABLE "users" ADD COLUMN "botCreatedAt" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "botLastRunAt" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "botStats" JSONB;

-- CreateIndex
CREATE INDEX "users_isBot_idx" ON "users"("isBot");
