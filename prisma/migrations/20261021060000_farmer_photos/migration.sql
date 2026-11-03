CREATE TABLE "farmer_photos" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "farmer_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "farmer_photos_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "farmer_photos_farmerId_createdAt_idx" ON "farmer_photos"("farmerId", "createdAt");
