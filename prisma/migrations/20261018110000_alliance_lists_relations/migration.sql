-- Alliance Farm/Hit/Block lists and ally relations (#66 phase 4). Additive only.
CREATE TYPE "AllianceListType" AS ENUM ('FARM', 'HIT', 'BLOCK');
CREATE TYPE "AllianceRelationStatus" AS ENUM ('PENDING', 'ACTIVE');

CREATE TABLE "alliance_list_entries" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "list_type" "AllianceListType" NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "added_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alliance_list_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alliance_relations" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "other_alliance_id" INTEGER NOT NULL,
    "status" "AllianceRelationStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "alliance_relations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alliance_list_entries_alliance_id_list_type_target_user_id_key" ON "alliance_list_entries"("alliance_id", "list_type", "target_user_id");
CREATE INDEX "idx_alliance_list_entries_list" ON "alliance_list_entries"("alliance_id", "list_type");
CREATE INDEX "idx_alliance_list_entries_target" ON "alliance_list_entries"("target_user_id");
CREATE UNIQUE INDEX "alliance_relations_alliance_id_other_alliance_id_key" ON "alliance_relations"("alliance_id", "other_alliance_id");
CREATE INDEX "idx_alliance_relations_other" ON "alliance_relations"("other_alliance_id");

ALTER TABLE "alliance_list_entries" ADD CONSTRAINT "alliance_list_entries_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_list_entries" ADD CONSTRAINT "alliance_list_entries_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_relations" ADD CONSTRAINT "alliance_relations_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alliance_relations" ADD CONSTRAINT "alliance_relations_other_alliance_id_fkey" FOREIGN KEY ("other_alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
