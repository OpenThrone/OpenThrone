ALTER TYPE "EmailCategory" ADD VALUE 'ATTACK_NOTIFICATION';
ALTER TABLE "EmailOutbox" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "EmailOutbox_eventKey_key" ON "EmailOutbox"("eventKey");
