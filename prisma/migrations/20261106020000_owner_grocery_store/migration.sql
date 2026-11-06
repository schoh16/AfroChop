CREATE TYPE "GroceryOrderStatus" AS ENUM ('quoted', 'awaiting_payment', 'paid', 'fulfilled', 'expired');
CREATE TYPE "GroceryFulfillment" AS ENUM ('shipping', 'pickup');

CREATE TABLE "grocery_store" (
  "id" TEXT NOT NULL DEFAULT 'afrochop',
  "ownerId" UUID NOT NULL,
  "originEncrypted" TEXT NOT NULL,
  "pickupInstructions" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grocery_store_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "grocery_products" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ingredients" TEXT NOT NULL,
  "allergenNotice" TEXT NOT NULL,
  "imageUrl" TEXT,
  "priceCents" INTEGER NOT NULL,
  "stock" INTEGER NOT NULL,
  "weightOz" DOUBLE PRECISION NOT NULL,
  "lengthIn" DOUBLE PRECISION NOT NULL,
  "widthIn" DOUBLE PRECISION NOT NULL,
  "heightIn" DOUBLE PRECISION NOT NULL,
  "taxCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grocery_products_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "grocery_orders" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "status" "GroceryOrderStatus" NOT NULL DEFAULT 'quoted',
  "fulfillment" "GroceryFulfillment" NOT NULL,
  "destinationEncrypted" TEXT,
  "rates" JSONB NOT NULL,
  "originVersion" TIMESTAMP(3) NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "shippingCents" INTEGER,
  "shippingRateId" TEXT,
  "shippingService" TEXT,
  "taxCents" INTEGER,
  "totalCents" INTEGER,
  "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
  "checkoutExpiresAt" TIMESTAMP(3),
  "stripeSessionId" TEXT,
  "checkoutUrl" TEXT,
  "lastError" TEXT,
  "trackingNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grocery_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "grocery_order_items" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "taxCode" TEXT NOT NULL,
  CONSTRAINT "grocery_order_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grocery_orders_stripeSessionId_key" ON "grocery_orders"("stripeSessionId");
CREATE INDEX "grocery_orders_status_checkoutExpiresAt_idx" ON "grocery_orders"("status", "checkoutExpiresAt");
CREATE UNIQUE INDEX "grocery_order_items_orderId_productId_key" ON "grocery_order_items"("orderId", "productId");
ALTER TABLE "grocery_orders" ADD CONSTRAINT "grocery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grocery_order_items" ADD CONSTRAINT "grocery_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "grocery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grocery_order_items" ADD CONSTRAINT "grocery_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
