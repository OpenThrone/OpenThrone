ALTER TABLE "users"
ADD COLUMN "spy_pressure_today" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "spy_pressure_date" TIMESTAMPTZ(3);

CREATE INDEX "users_spy_pressure_date_idx" ON "users"("spy_pressure_date");
