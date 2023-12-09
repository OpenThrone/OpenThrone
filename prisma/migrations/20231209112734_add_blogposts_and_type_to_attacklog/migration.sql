-- AlterTable
ALTER TABLE "attack_log" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'attack';

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "date_time" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_date" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_date" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "unread" SET DEFAULT true;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "locale" DROP DEFAULT;

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "created_timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_timestamp" TIMESTAMPTZ(3) NOT NULL,
    "postedby_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_read_status" (
    "post_id" INTEGER NOT NULL,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "post_read_status_pkey" PRIMARY KEY ("post_id","user_id")
);

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_postedby_id_fkey" FOREIGN KEY ("postedby_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_read_status" ADD CONSTRAINT "post_read_status_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_read_status" ADD CONSTRAINT "post_read_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
