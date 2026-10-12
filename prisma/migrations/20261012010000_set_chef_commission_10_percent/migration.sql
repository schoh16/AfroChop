ALTER TABLE "payment_configurations"
ALTER COLUMN "chefCommissionBps" SET DEFAULT 1000;

UPDATE "payment_configurations"
SET "chefCommissionBps" = 1000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default';
