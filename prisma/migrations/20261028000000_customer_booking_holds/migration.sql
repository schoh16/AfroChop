ALTER TYPE "QuoteStatus" ADD VALUE 'expired';
ALTER TYPE "BookingStatus" ADD VALUE 'expired';

ALTER TABLE "booking_requests"
ADD COLUMN "paymentHoldExpiresAt" TIMESTAMP(3);

UPDATE "booking_requests"
SET "paymentHoldExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '24 hours'
WHERE "status" = 'awaiting_payment';

CREATE INDEX "booking_requests_status_paymentHoldExpiresAt_idx"
ON "booking_requests"("status", "paymentHoldExpiresAt");
