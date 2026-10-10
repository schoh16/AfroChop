CREATE TYPE "StripeConnectedAccountStatus" AS ENUM ('pending', 'restricted', 'eligible');

CREATE TABLE "stripe_connected_accounts" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "status" "StripeConnectedAccountStatus" NOT NULL DEFAULT 'pending',
    "transferCapabilityStatus" TEXT,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "requirements" JSONB,
    "disabledReason" TEXT,
    "connectRefreshTokenHash" TEXT,
    "connectRefreshTokenExpiresAt" TIMESTAMP(3),
    "connectRefreshTokenUsedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_connected_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_configurations" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "chefCommissionBps" INTEGER NOT NULL DEFAULT 1500,
    "customerMarketplaceFeeBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_connected_accounts_chefId_key" ON "stripe_connected_accounts"("chefId");
CREATE UNIQUE INDEX "stripe_connected_accounts_stripeAccountId_key" ON "stripe_connected_accounts"("stripeAccountId");
CREATE UNIQUE INDEX "stripe_connected_accounts_connectRefreshTokenHash_key" ON "stripe_connected_accounts"("connectRefreshTokenHash");
CREATE INDEX "stripe_connected_accounts_status_updatedAt_idx" ON "stripe_connected_accounts"("status", "updatedAt");
CREATE UNIQUE INDEX "payment_webhook_events_stripeEventId_key" ON "payment_webhook_events"("stripeEventId");
CREATE INDEX "payment_webhook_events_eventType_createdAt_idx" ON "payment_webhook_events"("eventType", "createdAt");

ALTER TABLE "payment_configurations"
ADD CONSTRAINT "payment_configurations_chefCommissionBps_range"
CHECK ("chefCommissionBps" BETWEEN 0 AND 10000),
ADD CONSTRAINT "payment_configurations_customerMarketplaceFeeBps_range"
CHECK ("customerMarketplaceFeeBps" BETWEEN 0 AND 10000);

ALTER TABLE "stripe_connected_accounts"
ADD CONSTRAINT "stripe_connected_accounts_chefId_fkey"
FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "payment_configurations" ("id", "chefCommissionBps", "customerMarketplaceFeeBps", "updatedAt")
VALUES ('default', 1500, 0, CURRENT_TIMESTAMP);
