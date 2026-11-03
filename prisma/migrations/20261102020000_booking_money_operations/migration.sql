CREATE TYPE "BookingPayoutStatus" AS ENUM ('held', 'released', 'reversed');
CREATE TYPE "BookingRefundStatus" AS ENUM ('requested', 'approved', 'rejected', 'succeeded');

CREATE TABLE "booking_payments" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "stripeSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeChargeId" TEXT,
  "stripeTransferId" TEXT,
  "destinationAccountId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "quoteCents" INTEGER NOT NULL,
  "customerFeeCents" INTEGER NOT NULL,
  "platformFeeCents" INTEGER NOT NULL,
  "grossCents" INTEGER NOT NULL,
  "chefCents" INTEGER NOT NULL,
  "refundedCents" INTEGER NOT NULL DEFAULT 0,
  "disputeOpen" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMP(3),
  "payoutStatus" "BookingPayoutStatus" NOT NULL DEFAULT 'held',
  "releasedAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "booking_payments_amounts_check" CHECK ("quoteCents" > 0 AND "customerFeeCents" >= 0 AND "platformFeeCents" >= 0 AND "chefCents" > 0 AND "grossCents" = "quoteCents" + "customerFeeCents" AND "chefCents" = "quoteCents" - "platformFeeCents" AND "refundedCents" BETWEEN 0 AND "grossCents")
);
CREATE UNIQUE INDEX "booking_payments_bookingId_key" ON "booking_payments"("bookingId");
CREATE UNIQUE INDEX "booking_payments_stripeSessionId_key" ON "booking_payments"("stripeSessionId");
CREATE UNIQUE INDEX "booking_payments_stripePaymentIntentId_key" ON "booking_payments"("stripePaymentIntentId");
CREATE UNIQUE INDEX "booking_payments_stripeChargeId_key" ON "booking_payments"("stripeChargeId");
CREATE UNIQUE INDEX "booking_payments_stripeTransferId_key" ON "booking_payments"("stripeTransferId");
CREATE INDEX "booking_payments_payoutStatus_paidAt_idx" ON "booking_payments"("payoutStatus", "paidAt");

CREATE TABLE "booking_refunds" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "status" "BookingRefundStatus" NOT NULL DEFAULT 'requested',
  "reason" TEXT NOT NULL,
  "reviewerId" UUID,
  "reviewerNotes" TEXT,
  "stripeRefundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "booking_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "booking_refunds_paymentId_key" ON "booking_refunds"("paymentId");
CREATE UNIQUE INDEX "booking_refunds_stripeRefundId_key" ON "booking_refunds"("stripeRefundId");
CREATE INDEX "booking_refunds_status_createdAt_idx" ON "booking_refunds"("status", "createdAt");

CREATE TABLE "payment_ledger_entries" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "booking_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_ledger_entries_externalId_key" ON "payment_ledger_entries"("externalId");
CREATE INDEX "payment_ledger_entries_paymentId_createdAt_idx" ON "payment_ledger_entries"("paymentId", "createdAt");

CREATE TABLE "verification_challenges" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "UserVerificationType" NOT NULL,
  "targetHash" TEXT NOT NULL,
  "providerSid" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "verification_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "verification_challenges_userId_type_key" ON "verification_challenges"("userId", "type");
CREATE INDEX "verification_challenges_expiresAt_idx" ON "verification_challenges"("expiresAt");
