-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "units" JSONB DEFAULT '[{"type": "CITIZEN", "level": 1, "quantity": 50}, {"type": "WORKER", "level": 1, "quantity": 0}, {"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}]',
    "experience" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 25000,
    "gold_in_bank" INTEGER NOT NULL DEFAULT 0,
    "fort_level" INTEGER NOT NULL DEFAULT 1,
    "fort_hitpoints" INTEGER NOT NULL DEFAULT 100,
    "attack_turns" INTEGER NOT NULL DEFAULT 10,
    "last_active" TIMESTAMPTZ(3),
    "rank" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB DEFAULT '[{"type": "WEAPON", "level": 1, "quantity": 0, "usage": "OFFENSE"}]',
    "house_level" INTEGER NOT NULL DEFAULT 0,
    "battle_upgrades" JSONB DEFAULT '[{"type": "Offense", "level": 1, "quantity": 0}, {"type": "Spy", "level": 1, "quantity": 0}, {"type": "Sentry", "level": 1, "quantity": 0}]',
    "structure_upgrades" JSONB DEFAULT '[{"type": "Offense", "level": 1}, {"type": "Spy", "level": 1}, {"type": "Sentry", "level": 1}]',
    "bonus_points" JSONB DEFAULT '[{"type": "OFFENSE", "level":0,"type": "DEFENSE", "level":0,"type": "INCOME", "level":0,"type": "INTEL", "level":0,"type": "PRICES", "level":0 }]',
    "bio" TEXT NOT NULL DEFAULT '',
    "colorScheme" TEXT,
    "recruit_link" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attack_log" (
    "id" SERIAL NOT NULL,
    "attacker_id" INTEGER NOT NULL,
    "defender_id" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(3),
    "winner" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,

    CONSTRAINT "attack_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_history" (
    "id" SERIAL NOT NULL,
    "gold_amount" INTEGER NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "from_user_account_type" TEXT NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "to_user_account_type" TEXT NOT NULL,
    "date_time" TIMESTAMPTZ(3),
    "history_type" TEXT NOT NULL,

    CONSTRAINT "bank_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "date_time" TIMESTAMPTZ(3),
    "created_date" TIMESTAMPTZ(3),
    "updated_date" TIMESTAMPTZ(3),
    "body" TEXT NOT NULL,
    "unread" BOOLEAN NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruit_history" (
    "id" SERIAL NOT NULL,
    "from_user" INTEGER,
    "to_user" INTEGER NOT NULL,
    "ip_addr" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3),

    CONSTRAINT "recruit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_display_name_key" ON "users"("display_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_recruit_link_key" ON "users"("recruit_link");

-- AddForeignKey
ALTER TABLE "attack_log" ADD CONSTRAINT "attack_log_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_log" ADD CONSTRAINT "attack_log_defender_id_fkey" FOREIGN KEY ("defender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruit_history" ADD CONSTRAINT "recruit_history_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

