CREATE TABLE "chef_menu_entries" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cuisineCountryId" UUID,
    "knownIngredients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "majorAllergens" "MajorAllergen"[] NOT NULL DEFAULT ARRAY[]::"MajorAllergen"[],
    "crossContactRisks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_menu_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chef_menu_templates" (
    "id" UUID NOT NULL,
    "chefId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serves" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chef_menu_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chef_menu_template_items" (
    "templateId" UUID NOT NULL,
    "menuEntryId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chef_menu_template_items_pkey" PRIMARY KEY ("templateId", "menuEntryId")
);

CREATE INDEX "chef_menu_entries_chefId_isAvailable_sortOrder_idx"
    ON "chef_menu_entries"("chefId", "isAvailable", "sortOrder");
CREATE INDEX "chef_menu_entries_cuisineCountryId_idx"
    ON "chef_menu_entries"("cuisineCountryId");
CREATE INDEX "chef_menu_templates_chefId_createdAt_idx"
    ON "chef_menu_templates"("chefId", "createdAt");
CREATE INDEX "chef_menu_template_items_menuEntryId_idx"
    ON "chef_menu_template_items"("menuEntryId");

ALTER TABLE "chef_menu_entries"
    ADD CONSTRAINT "chef_menu_entries_chefId_fkey"
    FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chef_menu_entries"
    ADD CONSTRAINT "chef_menu_entries_cuisineCountryId_fkey"
    FOREIGN KEY ("cuisineCountryId") REFERENCES "countries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chef_menu_templates"
    ADD CONSTRAINT "chef_menu_templates_chefId_fkey"
    FOREIGN KEY ("chefId") REFERENCES "chef_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chef_menu_template_items"
    ADD CONSTRAINT "chef_menu_template_items_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "chef_menu_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chef_menu_template_items"
    ADD CONSTRAINT "chef_menu_template_items_menuEntryId_fkey"
    FOREIGN KEY ("menuEntryId") REFERENCES "chef_menu_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
