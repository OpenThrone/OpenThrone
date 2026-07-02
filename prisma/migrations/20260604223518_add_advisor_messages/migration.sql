-- CreateTable
CREATE TABLE "advisor_messages" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "advisor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advisor_messages_is_active_sort_order_idx" ON "advisor_messages"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "advisor_messages" ADD CONSTRAINT "advisor_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
