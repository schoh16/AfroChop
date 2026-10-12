ALTER TABLE "messages" ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "messages_recipientId_readAt_idx" ON "messages"("recipientId", "readAt");
