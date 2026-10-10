-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'chef', 'admin');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('CENTRAL_AFRICA', 'WEST_AFRICA', 'EAST_AFRICA', 'NORTH_AFRICA', 'SOUTHERN_AFRICA', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('prepared_meals', 'bulk_meal_prep', 'in_home_cooking', 'grocery_shopping', 'special_event', 'postpartum', 'recurring');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('requested', 'quoted', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "ChefVerificationStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "AllergyReviewStatus" AS ENUM ('not_required', 'pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "PermitVerificationStatus" AS ENUM ('pending', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "SafetyIncidentStatus" AS ENUM ('reported', 'under_review', 'escalated', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "SafetyIncidentSeverity" AS ENUM ('urgent', 'high', 'standard');

-- CreateEnum
CREATE TYPE "MajorAllergen" AS ENUM ('milk', 'eggs', 'fish', 'crustacean_shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "cuisineDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dishes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "knownIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "majorAllergens" "MajorAllergen"[] DEFAULT ARRAY[]::"MajorAllergen"[],
    "crossContactRisks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_countries" (
    "id" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "countryId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dish_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "city" TEXT,
    "state" TEXT,
    "countryCode" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceTypes" "ServiceType"[] DEFAULT ARRAY[]::"ServiceType"[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "serviceRadiusKm" INTEGER,
    "experienceYears" INTEGER,
    "languages" TEXT[],
    "profileImageUrl" TEXT,
    "coverImageUrl" TEXT,
    "verificationStatus" "ChefVerificationStatus" NOT NULL DEFAULT 'pending',
    "averageRating" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_food_photos" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chef_food_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_service_areas" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "countryCode" TEXT,
    "centerLatitude" DOUBLE PRECISION,
    "centerLongitude" DOUBLE PRECISION,
    "radiusKm" INTEGER NOT NULL DEFAULT 25,
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "offersPickup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_availability" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_dishes" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "leadTimeHours" INTEGER NOT NULL DEFAULT 24,
    "availability" TEXT,
    "portionSize" TEXT,
    "description" TEXT,
    "knownIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "majorAllergens" "MajorAllergen"[] DEFAULT ARRAY[]::"MajorAllergen"[],
    "crossContactRisks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "chefId" UUID,
    "serviceType" "ServiceType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'requested',
    "requestedDate" TIMESTAMP(3),
    "desiredDate" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "serviceEndAt" TIMESTAMP(3),
    "serviceJurisdictionCode" TEXT,
    "notes" TEXT,
    "disclosedAllergens" "MajorAllergen"[] DEFAULT ARRAY[]::"MajorAllergen"[],
    "dietaryRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergyAcknowledgedAt" TIMESTAMP(3),
    "allergyNoticeVersion" TEXT,
    "allergyReviewStatus" "AllergyReviewStatus" NOT NULL DEFAULT 'not_required',
    "allergyReviewedAt" TIMESTAMP(3),
    "allergyResponseNote" TEXT,
    "budget" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2),
    "downPaymentPercent" INTEGER NOT NULL DEFAULT 50,
    "finalPaymentDueAt" TIMESTAMP(3),
    "quoteAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "bookingRequestId" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2) NOT NULL,
    "downPaymentPercent" INTEGER NOT NULL DEFAULT 50,
    "notes" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_receipts" (
    "id" UUID NOT NULL,
    "bookingRequestId" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "totalSpent" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_permits" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "permitType" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verificationStatus" "PermitVerificationStatus" NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_rules" (
    "id" UUID NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "requiresApprovedProvider" BOOLEAN NOT NULL DEFAULT true,
    "requiredPermitTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "chefId" UUID,
    "bookingRequestId" UUID,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "SafetyIncidentSeverity" NOT NULL DEFAULT 'standard',
    "status" "SafetyIncidentStatus" NOT NULL DEFAULT 'reported',
    "urgentReportedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "chefSuspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dishes_slug_key" ON "dishes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "dish_countries_dishId_countryId_key" ON "dish_countries"("dishId", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "chef_profiles_userId_key" ON "chef_profiles"("userId");

-- CreateIndex
CREATE INDEX "chef_food_photos_chefId_createdAt_idx" ON "chef_food_photos"("chefId", "createdAt");

-- CreateIndex
CREATE INDEX "chef_service_areas_city_state_countryCode_idx" ON "chef_service_areas"("city", "state", "countryCode");

-- CreateIndex
CREATE INDEX "chef_availability_chefId_dayOfWeek_isAvailable_idx" ON "chef_availability"("chefId", "dayOfWeek", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "chef_availability_chefId_dayOfWeek_startTime_endTime_key" ON "chef_availability"("chefId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "chef_dishes_chefId_dishId_key" ON "chef_dishes"("chefId", "dishId");

-- CreateIndex
CREATE INDEX "booking_requests_chefId_desiredDate_status_idx" ON "booking_requests"("chefId", "desiredDate", "status");

-- CreateIndex
CREATE INDEX "booking_requests_customerId_createdAt_idx" ON "booking_requests"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_senderId_recipientId_createdAt_idx" ON "messages"("senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "chef_permits_chefId_jurisdictionCode_serviceType_verificati_idx" ON "chef_permits"("chefId", "jurisdictionCode", "serviceType", "verificationStatus", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_rules_jurisdictionCode_serviceType_key" ON "compliance_rules"("jurisdictionCode", "serviceType");

-- CreateIndex
CREATE INDEX "safety_incidents_status_severity_createdAt_idx" ON "safety_incidents"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "safety_incidents_chefId_createdAt_idx" ON "safety_incidents"("chefId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_targetId_createdAt_idx" ON "admin_audit_logs"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actorId_createdAt_idx" ON "admin_audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "dish_countries" ADD CONSTRAINT "dish_countries_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_countries" ADD CONSTRAINT "dish_countries_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_profiles" ADD CONSTRAINT "chef_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_food_photos" ADD CONSTRAINT "chef_food_photos_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_service_areas" ADD CONSTRAINT "chef_service_areas_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_availability" ADD CONSTRAINT "chef_availability_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_dishes" ADD CONSTRAINT "chef_dishes_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_dishes" ADD CONSTRAINT "chef_dishes_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipts" ADD CONSTRAINT "grocery_receipts_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipts" ADD CONSTRAINT "grocery_receipts_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_permits" ADD CONSTRAINT "chef_permits_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "booking_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

