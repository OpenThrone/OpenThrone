-- Gameplay activity timestamp used by the daily citizen bonus.
ALTER TABLE "users" ADD COLUMN "last_gameplay_at" TIMESTAMPTZ(3);
CREATE INDEX "users_currentEraId_last_gameplay_at_idx" ON "users"("currentEraId", "last_gameplay_at");
