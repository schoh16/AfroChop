CREATE TYPE "ChefMediaType" AS ENUM ('image', 'video');

ALTER TABLE "chef_food_photos"
ADD COLUMN "mediaType" "ChefMediaType" NOT NULL DEFAULT 'image';
