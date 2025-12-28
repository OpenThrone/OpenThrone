-- Add snapshot fields to capture meaningful end-of-era data
ALTER TABLE "UserEra"
ADD COLUMN "rankAtEnd" INTEGER,
ADD COLUMN "goldAtEnd" BIGINT,
ADD COLUMN "goldInBankAtEnd" BIGINT,
ADD COLUMN "offenseAtEnd" INTEGER,
ADD COLUMN "defenseAtEnd" INTEGER,
ADD COLUMN "spyAtEnd" INTEGER,
ADD COLUMN "sentryAtEnd" INTEGER,
ADD COLUMN "fortLevelAtEnd" INTEGER,
ADD COLUMN "houseLevelAtEnd" INTEGER,
ADD COLUMN "economyLevelAtEnd" INTEGER;
