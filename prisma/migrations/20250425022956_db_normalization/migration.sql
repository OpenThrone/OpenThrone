-- CreateTable
CREATE TABLE "user_units" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "user_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "user_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_battle_upgrades" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "user_battle_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_structure_upgrades" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "user_structure_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_units_userId_type_level_key" ON "user_units"("userId", "type", "level");

-- CreateIndex
CREATE UNIQUE INDEX "user_items_userId_type_usage_level_key" ON "user_items"("userId", "type", "usage", "level");

-- CreateIndex
CREATE UNIQUE INDEX "user_battle_upgrades_userId_type_level_key" ON "user_battle_upgrades"("userId", "type", "level");

-- CreateIndex
CREATE UNIQUE INDEX "user_structure_upgrades_userId_type_key" ON "user_structure_upgrades"("userId", "type");

-- AddForeignKey
ALTER TABLE "user_units" ADD CONSTRAINT "user_units_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_battle_upgrades" ADD CONSTRAINT "user_battle_upgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_structure_upgrades" ADD CONSTRAINT "user_structure_upgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
