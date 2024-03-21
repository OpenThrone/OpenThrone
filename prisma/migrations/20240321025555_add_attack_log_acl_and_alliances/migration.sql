-- DropForeignKey
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey";

-- DropIndex
DROP INDEX "PasswordReset_userId_key";

-- CreateTable
CREATE TABLE "attack_log_acl" (
    "id" SERIAL NOT NULL,
    "attack_log_id" INTEGER NOT NULL,
    "shared_with_user_id" INTEGER,
    "shared_with_alliance_id" INTEGER,

    CONSTRAINT "attack_log_acl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliances" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "leader_id" INTEGER NOT NULL,
    "usersId" INTEGER,

    CONSTRAINT "alliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_memberships" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "alliance_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alliance_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "alliance_id" INTEGER NOT NULL,

    CONSTRAINT "alliance_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_acl_user" ON "attack_log_acl"("shared_with_user_id");

-- CreateIndex
CREATE INDEX "idx_acl_alliance" ON "attack_log_acl"("shared_with_alliance_id");

-- CreateIndex
CREATE INDEX "idx_alliance_leader" ON "alliances"("leader_id");

-- CreateIndex
CREATE INDEX "idx_membership_user" ON "alliance_memberships"("user_id");

-- CreateIndex
CREATE INDEX "idx_membership_alliance" ON "alliance_memberships"("alliance_id");

-- CreateIndex
CREATE INDEX "idx_membership_role" ON "alliance_memberships"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "alliance_memberships_alliance_id_user_id_key" ON "alliance_memberships"("alliance_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_role_alliance" ON "alliance_roles"("alliance_id");

-- AddForeignKey
ALTER TABLE "attack_log_acl" ADD CONSTRAINT "attack_log_acl_attack_log_id_fkey" FOREIGN KEY ("attack_log_id") REFERENCES "attack_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_log_acl" ADD CONSTRAINT "attack_log_acl_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_log_acl" ADD CONSTRAINT "attack_log_acl_shared_with_alliance_id_fkey" FOREIGN KEY ("shared_with_alliance_id") REFERENCES "alliances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliances" ADD CONSTRAINT "alliances_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliances" ADD CONSTRAINT "alliances_usersId_fkey" FOREIGN KEY ("usersId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_memberships" ADD CONSTRAINT "alliance_memberships_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_memberships" ADD CONSTRAINT "alliance_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_memberships" ADD CONSTRAINT "alliance_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "alliance_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alliance_roles" ADD CONSTRAINT "alliance_roles_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
