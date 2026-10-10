-- CreateEnum
CREATE TYPE "UserVerificationType" AS ENUM ('email', 'phone', 'identity');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected', 'needs_more_info', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "ChefCredentialType" AS ENUM ('identity', 'food_safety_training', 'business_permit', 'license', 'background_screening');

-- AlterTable
ALTER TABLE "compliance_rules" ADD COLUMN     "requiresBackgroundScreening" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresFoodSafetyCredential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresIdentityVerification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresServiceApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE "user_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "UserVerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_credentials" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "type" "ChefCredentialType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "jurisdictionCode" TEXT,
    "serviceType" "ServiceType",
    "providerReference" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chef_service_approvals" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_service_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_screening_records" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "consentedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_screening_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "chefId" UUID,
    "storageObjectKey" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "malwareScanStatus" TEXT NOT NULL DEFAULT 'pending',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "subjectId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_verifications_type_status_updatedAt_idx" ON "user_verifications"("type", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_userId_type_key" ON "user_verifications"("userId", "type");

-- CreateIndex
CREATE INDEX "chef_credentials_chefId_type_status_expiresAt_idx" ON "chef_credentials"("chefId", "type", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "chef_service_approvals_serviceType_jurisdictionCode_status__idx" ON "chef_service_approvals"("serviceType", "jurisdictionCode", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "chef_service_approvals_chefId_serviceType_jurisdictionCode_key" ON "chef_service_approvals"("chefId", "serviceType", "jurisdictionCode");

-- CreateIndex
CREATE INDEX "background_screening_records_chefId_serviceType_jurisdictio_idx" ON "background_screening_records"("chefId", "serviceType", "jurisdictionCode", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_documents_storageObjectKey_key" ON "verification_documents"("storageObjectKey");

-- CreateIndex
CREATE INDEX "verification_documents_status_malwareScanStatus_uploadedAt_idx" ON "verification_documents"("status", "malwareScanStatus", "uploadedAt");

-- CreateIndex
CREATE INDEX "verification_documents_userId_status_idx" ON "verification_documents"("userId", "status");

-- CreateIndex
CREATE INDEX "verification_documents_chefId_status_idx" ON "verification_documents"("chefId", "status");

-- CreateIndex
CREATE INDEX "verification_audit_logs_targetType_targetId_createdAt_idx" ON "verification_audit_logs"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_audit_logs_actorId_createdAt_idx" ON "verification_audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_credentials" ADD CONSTRAINT "chef_credentials_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_service_approvals" ADD CONSTRAINT "chef_service_approvals_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_screening_records" ADD CONSTRAINT "background_screening_records_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_audit_logs" ADD CONSTRAINT "verification_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_audit_logs" ADD CONSTRAINT "verification_audit_logs_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
