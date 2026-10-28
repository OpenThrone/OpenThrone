ALTER TABLE "ChatMessage"
  ADD COLUMN "richContent" JSONB,
  ADD COLUMN "clientMessageId" VARCHAR(64);
CREATE UNIQUE INDEX "ChatMessage_roomId_senderId_clientMessageId_key"
  ON "ChatMessage"("roomId", "senderId", "clientMessageId");
CREATE INDEX "ChatMessage_roomId_id_idx" ON "ChatMessage"("roomId", "id");
