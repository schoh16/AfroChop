-- AlterTable
ALTER TABLE "chef_permits"
RENAME COLUMN "documentUrl" TO "storageObjectKey";

ALTER TABLE "chef_permits"
ADD COLUMN "malwareScanStatus" TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE "verification_documents"
ADD CONSTRAINT "verification_documents_exactly_one_owner"
CHECK (("userId" IS NOT NULL) <> ("chefId" IS NOT NULL));

UPDATE "chef_permits"
SET "malwareScanStatus" = 'quarantined'
WHERE "storageObjectKey" LIKE 'http://%' OR "storageObjectKey" LIKE 'https://%';
