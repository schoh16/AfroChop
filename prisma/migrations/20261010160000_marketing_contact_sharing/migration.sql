ALTER TABLE "users"
ADD COLUMN "marketingContactSharing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingCountryCode" TEXT,
ADD COLUMN "marketingContactSharingUpdatedAt" TIMESTAMP(3);
