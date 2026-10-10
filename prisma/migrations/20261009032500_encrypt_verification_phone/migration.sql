DROP INDEX "users_phoneNumber_key";

ALTER TABLE "users"
RENAME COLUMN "phoneNumber" TO "phoneNumberLegacy";

ALTER TABLE "users"
ADD COLUMN "phoneNumberEncrypted" TEXT,
ADD COLUMN "phoneNumberHash" TEXT,
ADD COLUMN "phoneNumberLast4" TEXT;

CREATE UNIQUE INDEX "users_phoneNumberHash_key"
ON "users"("phoneNumberHash");
