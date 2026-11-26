-- Catálogo de categorías (máx. 2 niveles) y marcas por negocio.
-- category_id existente en products queda; se añade brand_id y FKs tenant.

CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(40),
    "description" TEXT,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_brands" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "product_brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_business_id_id_key" ON "product_categories"("business_id", "id");
CREATE UNIQUE INDEX "product_categories_business_id_normalized_name_key" ON "product_categories"("business_id", "normalized_name");
CREATE INDEX "product_categories_business_id_parent_id_idx" ON "product_categories"("business_id", "parent_id");
CREATE INDEX "product_categories_business_id_is_active_idx" ON "product_categories"("business_id", "is_active");

CREATE UNIQUE INDEX "product_brands_business_id_id_key" ON "product_brands"("business_id", "id");
CREATE UNIQUE INDEX "product_brands_business_id_normalized_name_key" ON "product_brands"("business_id", "normalized_name");
CREATE INDEX "product_brands_business_id_is_active_idx" ON "product_brands"("business_id", "is_active");

ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_business_id_parent_id_fkey"
  FOREIGN KEY ("business_id", "parent_id") REFERENCES "product_categories"("business_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_brands"
  ADD CONSTRAINT "product_brands_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- brand_id en productos (category_id ya existía sin FK tipada)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_id" UUID;

CREATE INDEX IF NOT EXISTS "products_business_id_category_id_idx" ON "products"("business_id", "category_id");
CREATE INDEX IF NOT EXISTS "products_business_id_brand_id_idx" ON "products"("business_id", "brand_id");

-- Limpiar category_id huérfanos antes de la FK (registros legacy sin tabla).
UPDATE "products" SET "category_id" = NULL
WHERE "category_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_categories" c
    WHERE c."business_id" = "products"."business_id" AND c."id" = "products"."category_id"
  );

ALTER TABLE "products"
  ADD CONSTRAINT "products_business_id_category_id_fkey"
  FOREIGN KEY ("business_id", "category_id") REFERENCES "product_categories"("business_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_business_id_brand_id_fkey"
  FOREIGN KEY ("business_id", "brand_id") REFERENCES "product_brands"("business_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
