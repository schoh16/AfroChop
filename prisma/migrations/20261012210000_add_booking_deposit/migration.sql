ALTER TABLE "booking_requests" ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "depositAmount" DECIMAL(10,2),
ADD COLUMN "depositPaidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "booking_requests_stripeCheckoutSessionId_key" ON "booking_requests"("stripeCheckoutSessionId");
