CREATE TABLE "customer_service_addresses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "encryptedAddress" TEXT NOT NULL,
    "addressHash" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerReference" TEXT,
    "validatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_service_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_service_addresses_userId_addressHash_key"
ON "customer_service_addresses"("userId", "addressHash");

CREATE INDEX "customer_service_addresses_userId_status_updatedAt_idx"
ON "customer_service_addresses"("userId", "status", "updatedAt");

ALTER TABLE "customer_service_addresses"
ADD CONSTRAINT "customer_service_addresses_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_requests"
ADD COLUMN "customerServiceAddressId" UUID;

CREATE INDEX "booking_requests_customerServiceAddressId_idx"
ON "booking_requests"("customerServiceAddressId");

ALTER TABLE "booking_requests"
ADD CONSTRAINT "booking_requests_customerServiceAddressId_fkey"
FOREIGN KEY ("customerServiceAddressId") REFERENCES "customer_service_addresses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
