CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

ALTER TABLE "safety_incidents"
ADD COLUMN "targetUserId" UUID;

CREATE INDEX "safety_incidents_targetUserId_createdAt_idx"
ON "safety_incidents"("targetUserId", "createdAt");

ALTER TABLE "safety_incidents"
ADD CONSTRAINT "safety_incidents_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
