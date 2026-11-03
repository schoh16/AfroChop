CREATE TABLE "chef_email_codes" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "chef_email_codes_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "chef_email_codes_expiresAt_idx" ON "chef_email_codes"("expiresAt");
