-- Battle and recruit logs are deleted after 20 days. These totals survive them,
-- so era leaderboards stay complete without keeping the logs themselves.
ALTER TABLE "Era" ADD COLUMN "topBattles" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "UserEraActivity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eraId" INTEGER NOT NULL,
    "attacksWon" INTEGER NOT NULL DEFAULT 0,
    "defendsWon" INTEGER NOT NULL DEFAULT 0,
    "attackerCasualties" BIGINT NOT NULL DEFAULT 0,
    "defenderCasualties" BIGINT NOT NULL DEFAULT 0,
    "recruits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserEraActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserEraActivity_userId_eraId_key" ON "UserEraActivity"("userId", "eraId");
CREATE INDEX "UserEraActivity_eraId_idx" ON "UserEraActivity"("eraId");

ALTER TABLE "UserEraActivity" ADD CONSTRAINT "UserEraActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEraActivity" ADD CONSTRAINT "UserEraActivity_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "Era"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEraActivity" ENABLE ROW LEVEL SECURITY;
