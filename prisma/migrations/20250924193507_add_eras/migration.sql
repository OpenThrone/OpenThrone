-- AlterTable
ALTER TABLE "users" ADD COLUMN     "achievements" JSONB DEFAULT '{}',
ADD COLUMN     "currentEraId" INTEGER;

-- CreateTable
CREATE TABLE "Era" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMPTZ(3),

    CONSTRAINT "Era_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEra" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eraId" INTEGER NOT NULL,
    "levelAtStart" INTEGER NOT NULL DEFAULT 1,
    "unitsAtStart" JSONB NOT NULL DEFAULT '[]',
    "achievements" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Era_startDate_idx" ON "Era"("startDate");

-- CreateIndex
CREATE INDEX "UserEra_userId_idx" ON "UserEra"("userId");

-- CreateIndex
CREATE INDEX "UserEra_eraId_idx" ON "UserEra"("eraId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEra_userId_eraId_key" ON "UserEra"("userId", "eraId");

-- CreateIndex
CREATE INDEX "users_currentEraId_idx" ON "users"("currentEraId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_currentEraId_fkey" FOREIGN KEY ("currentEraId") REFERENCES "Era"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEra" ADD CONSTRAINT "UserEra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEra" ADD CONSTRAINT "UserEra_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "Era"("id") ON DELETE CASCADE ON UPDATE CASCADE;
