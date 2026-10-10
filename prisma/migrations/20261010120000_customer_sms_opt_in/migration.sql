ALTER TABLE "users"
ADD COLUMN "smsOrderUpdates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smsOrderUpdatesUpdatedAt" TIMESTAMP(3);
