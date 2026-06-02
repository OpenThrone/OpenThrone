ALTER TABLE "users"
ADD COLUMN "defense_pressure_today" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "defense_pressure_date" TIMESTAMPTZ(3),
ADD COLUMN "wounded_units" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "users_defense_pressure_date_idx" ON "users"("defense_pressure_date");
