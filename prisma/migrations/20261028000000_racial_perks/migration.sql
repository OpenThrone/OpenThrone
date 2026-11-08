ALTER TABLE "users" ADD COLUMN "racial_perk_tier" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sanctuary_recovered_today" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sanctuary_day" TEXT,
ADD COLUMN "sanctuary_cap" INTEGER NOT NULL DEFAULT 0;
