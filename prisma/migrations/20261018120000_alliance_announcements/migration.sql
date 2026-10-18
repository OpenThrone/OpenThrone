-- Alliance announcements (#66 phase 5): additive table only.
CREATE TABLE "alliance_announcements" (
    "id" SERIAL NOT NULL,
    "alliance_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "alliance_announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_alliance_announcements_alliance_created" ON "alliance_announcements"("alliance_id", "created_at");

ALTER TABLE "alliance_announcements" ADD CONSTRAINT "alliance_announcements_alliance_id_fkey" FOREIGN KEY ("alliance_id") REFERENCES "alliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alliance_announcements" ADD CONSTRAINT "alliance_announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
