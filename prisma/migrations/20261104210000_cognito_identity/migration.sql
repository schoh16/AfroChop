ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "cognitoSub" TEXT;
CREATE UNIQUE INDEX "users_cognitoSub_key" ON "users"("cognitoSub");
