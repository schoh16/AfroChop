-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'farmer';

-- CreateEnum
CREATE TYPE "FarmInquiryStatus" AS ENUM ('requested', 'quoted', 'declined', 'closed');

-- CreateTable
CREATE TABLE "farmer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "farmName" TEXT NOT NULL,
    "bio" TEXT,
    "city" TEXT,
    "state" TEXT,
    "countryCode" TEXT,
    "offersPickup" BOOLEAN NOT NULL DEFAULT true,
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "profileImageUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "farmer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_produce" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'vegetable',
    "description" TEXT,
    "price" DECIMAL(10,2),
    "unit" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "farm_produce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_inquiries" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "produceName" TEXT,
    "quantity" TEXT,
    "message" TEXT NOT NULL,
    "status" "FarmInquiryStatus" NOT NULL DEFAULT 'requested',
    "quoteAmount" DECIMAL(10,2),
    "quoteNotes" TEXT,
    "quotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "farm_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profiles_userId_key" ON "farmer_profiles"("userId");
CREATE INDEX "farmer_profiles_state_city_idx" ON "farmer_profiles"("state", "city");
CREATE INDEX "farm_produce_farmerId_isAvailable_idx" ON "farm_produce"("farmerId", "isAvailable");
CREATE INDEX "farm_produce_name_idx" ON "farm_produce"("name");
CREATE INDEX "farm_inquiries_customerId_createdAt_idx" ON "farm_inquiries"("customerId", "createdAt");
CREATE INDEX "farm_inquiries_farmerId_status_idx" ON "farm_inquiries"("farmerId", "status");

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_produce" ADD CONSTRAINT "farm_produce_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_inquiries" ADD CONSTRAINT "farm_inquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_inquiries" ADD CONSTRAINT "farm_inquiries_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;