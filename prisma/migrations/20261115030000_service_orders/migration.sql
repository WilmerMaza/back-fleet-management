-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceRuleType" AS ENUM ('MILEAGE', 'TIME', 'WHICHEVER_FIRST', 'CUSTOM');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "order_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_user_id" UUID,
    "mileage" INTEGER NOT NULL,
    "next_maintenance_mileage" INTEGER,
    "next_maintenance_date" DATE,
    "maintenance_rule" "MaintenanceRuleType",
    "observations" TEXT,
    "created_by" UUID NOT NULL,
    "operator_user_id" UUID,
    "technician_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_items" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "service_type_code" VARCHAR(60) NOT NULL,
    "service_type_name" VARCHAR(180) NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "origin" VARCHAR(20),
    "execution_status" VARCHAR(40),

    CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_product_usages" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "service_order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(60),
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "quantity_consumed" DECIMAL(14,3),
    "unit_price" DECIMAL(14,2),

    CONSTRAINT "service_order_product_usages_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "service_orders_business_id_id_key" ON "service_orders"("business_id", "id");
CREATE UNIQUE INDEX "service_orders_business_id_order_number_key" ON "service_orders"("business_id", "order_number");
CREATE INDEX "service_orders_business_id_status_opened_at_idx" ON "service_orders"("business_id", "status", "opened_at" DESC);
CREATE INDEX "service_orders_business_id_vehicle_id_idx" ON "service_orders"("business_id", "vehicle_id");
CREATE INDEX "service_orders_business_id_customer_id_idx" ON "service_orders"("business_id", "customer_id");

CREATE UNIQUE INDEX "service_order_items_business_id_id_key" ON "service_order_items"("business_id", "id");
CREATE INDEX "service_order_items_business_id_service_order_id_idx" ON "service_order_items"("business_id", "service_order_id");

CREATE UNIQUE INDEX "service_order_product_usages_business_id_id_key" ON "service_order_product_usages"("business_id", "id");
CREATE INDEX "service_order_product_usages_business_id_service_order_item_id_idx" ON "service_order_product_usages"("business_id", "service_order_item_id");
CREATE INDEX "service_order_product_usages_business_id_product_id_idx" ON "service_order_product_usages"("business_id", "product_id");

-- FKs
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_business_id_customer_id_fkey" FOREIGN KEY ("business_id", "customer_id") REFERENCES "customers"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_business_id_vehicle_id_fkey" FOREIGN KEY ("business_id", "vehicle_id") REFERENCES "vehicles"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_business_id_service_order_id_fkey" FOREIGN KEY ("business_id", "service_order_id") REFERENCES "service_orders"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_business_id_service_type_id_fkey" FOREIGN KEY ("business_id", "service_type_id") REFERENCES "service_types"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_order_product_usages" ADD CONSTRAINT "service_order_product_usages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_product_usages" ADD CONSTRAINT "service_order_product_usages_business_id_service_order_item_id_fkey" FOREIGN KEY ("business_id", "service_order_item_id") REFERENCES "service_order_items"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_product_usages" ADD CONSTRAINT "service_order_product_usages_business_id_product_id_fkey" FOREIGN KEY ("business_id", "product_id") REFERENCES "products"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non-negative mileage / quantity checks
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_mileage_non_negative" CHECK ("mileage" >= 0);
ALTER TABLE "service_order_product_usages" ADD CONSTRAINT "service_order_product_usages_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "service_order_product_usages" ADD CONSTRAINT "service_order_product_usages_consumed_non_negative" CHECK ("quantity_consumed" IS NULL OR "quantity_consumed" >= 0);
