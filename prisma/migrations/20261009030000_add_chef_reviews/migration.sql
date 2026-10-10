CREATE TYPE "ReviewModerationStatus" AS ENUM ('published', 'under_review', 'hidden', 'removed');
CREATE TYPE "ReviewReportStatus" AS ENUM ('pending', 'reviewed', 'dismissed');
CREATE TYPE "ReviewDisputeStatus" AS ENUM ('pending', 'appeal_granted', 'appeal_denied');

ALTER TABLE "chef_profiles"
ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "booking_requests"
ADD COLUMN "chefCompletedAt" TIMESTAMP(3),
ADD COLUMN "customerCompletedAt" TIMESTAMP(3);

CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "recommended" BOOLEAN NOT NULL,
    "foodQuality" INTEGER,
    "communication" INTEGER,
    "punctuality" INTEGER,
    "professionalism" INTEGER,
    "moderationStatus" "ReviewModerationStatus" NOT NULL DEFAULT 'published',
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_photos" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_reports" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReviewReportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chef_review_responses" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_review_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_disputes" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "appeal" TEXT NOT NULL,
    "status" "ReviewDisputeStatus" NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");
CREATE INDEX "reviews_chefId_moderationStatus_createdAt_idx" ON "reviews"("chefId", "moderationStatus", "createdAt");
CREATE INDEX "reviews_chefId_moderationStatus_rating_idx" ON "reviews"("chefId", "moderationStatus", "rating");
CREATE INDEX "review_photos_reviewId_createdAt_idx" ON "review_photos"("reviewId", "createdAt");
CREATE UNIQUE INDEX "review_reports_reviewId_reporterId_key" ON "review_reports"("reviewId", "reporterId");
CREATE INDEX "review_reports_status_createdAt_idx" ON "review_reports"("status", "createdAt");
CREATE UNIQUE INDEX "chef_review_responses_reviewId_key" ON "chef_review_responses"("reviewId");
CREATE UNIQUE INDEX "review_disputes_reviewId_key" ON "review_disputes"("reviewId");
CREATE INDEX "review_disputes_status_createdAt_idx" ON "review_disputes"("status", "createdAt");

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
ADD CONSTRAINT "reviews_foodQuality_range" CHECK ("foodQuality" IS NULL OR "foodQuality" BETWEEN 1 AND 5),
ADD CONSTRAINT "reviews_communication_range" CHECK ("communication" IS NULL OR "communication" BETWEEN 1 AND 5),
ADD CONSTRAINT "reviews_punctuality_range" CHECK ("punctuality" IS NULL OR "punctuality" BETWEEN 1 AND 5),
ADD CONSTRAINT "reviews_professionalism_range" CHECK ("professionalism" IS NULL OR "professionalism" BETWEEN 1 AND 5);

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "booking_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "reviews_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "reviews_chefId_fkey"
FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "review_photos"
ADD CONSTRAINT "review_photos_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_reports"
ADD CONSTRAINT "review_reports_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "review_reports_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chef_review_responses"
ADD CONSTRAINT "chef_review_responses_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "chef_review_responses_chefId_fkey"
FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_disputes"
ADD CONSTRAINT "review_disputes_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "review_disputes_chefId_fkey"
FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
