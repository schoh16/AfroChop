CREATE TYPE "ChefApplicationStatus" AS ENUM (
    'submitted',
    'visit_scheduled',
    'interviewed',
    'profile_setup',
    'rejected'
);

CREATE TABLE "chef_applications" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "encryptedHomeAddress" TEXT NOT NULL,
    "status" "ChefApplicationStatus" NOT NULL DEFAULT 'submitted',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitScheduledAt" TIMESTAMP(3),
    "interviewedAt" TIMESTAMP(3),
    "profileSetupAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chef_applications_chefId_key" ON "chef_applications"("chefId");
CREATE INDEX "chef_applications_status_submittedAt_idx" ON "chef_applications"("status", "submittedAt");

ALTER TABLE "chef_applications"
ADD CONSTRAINT "chef_applications_chefId_fkey"
FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
