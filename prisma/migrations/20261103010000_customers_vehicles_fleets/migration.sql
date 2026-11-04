CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CustomerType" AS ENUM ('PERSON', 'COMPANY');
CREATE TYPE "MileageSource" AS ENUM ('SERVICE_ORDER', 'MANUAL', 'IMPORT');

CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" "CustomerType" NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "document_type" VARCHAR(20),
    "document_number" VARCHAR(40),
    "first_name" VARCHAR(120),
    "last_name" VARCHAR(120),
    "nit" VARCHAR(30),
    "legal_name" VARCHAR(180),
    "trade_name" VARCHAR(180),
    "contact_name" VARCHAR(180),
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "address" VARCHAR(240),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_business_id_status_idx" ON "customers"("business_id", "status");
CREATE INDEX "customers_business_id_type_idx" ON "customers"("business_id", "type");
CREATE INDEX "customers_business_id_email_idx" ON "customers"("business_id", "email");
CREATE UNIQUE INDEX "customers_person_document_unique"
  ON "customers"("business_id", "document_type", "document_number")
  WHERE "type" = 'PERSON';
CREATE UNIQUE INDEX "customers_company_nit_unique"
  ON "customers"("business_id", "nit")
  WHERE "type" = 'COMPANY';

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fleets" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fleets_business_id_customer_id_idx" ON "fleets"("business_id", "customer_id");
CREATE INDEX "fleets_business_id_status_idx" ON "fleets"("business_id", "status");
CREATE INDEX "fleets_business_id_name_idx" ON "fleets"("business_id", "name");

ALTER TABLE "fleets"
  ADD CONSTRAINT "fleets_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fleets"
  ADD CONSTRAINT "fleets_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "fleet_id" UUID,
    "plate" VARCHAR(20) NOT NULL,
    "vin" VARCHAR(40),
    "brand" VARCHAR(80) NOT NULL,
    "line" VARCHAR(80) NOT NULL,
    "model" VARCHAR(80),
    "year" INTEGER,
    "vehicle_type" VARCHAR(40),
    "color" VARCHAR(40),
    "fuel_type" VARCHAR(40),
    "engine_capacity" VARCHAR(20),
    "version" VARCHAR(80),
    "current_mileage" INTEGER NOT NULL DEFAULT 0,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicles_mileage_non_negative" CHECK ("current_mileage" >= 0)
);

CREATE UNIQUE INDEX "vehicles_business_id_plate_key" ON "vehicles"("business_id", "plate");
CREATE INDEX "vehicles_business_id_customer_id_idx" ON "vehicles"("business_id", "customer_id");
CREATE INDEX "vehicles_business_id_fleet_id_idx" ON "vehicles"("business_id", "fleet_id");
CREATE INDEX "vehicles_business_id_status_idx" ON "vehicles"("business_id", "status");

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_fleet_id_fkey"
  FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vehicle_mileage_logs" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "mileage" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "MileageSource" NOT NULL,
    "source_id" UUID,
    "recorded_by" UUID,
    CONSTRAINT "vehicle_mileage_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicle_mileage_logs_mileage_non_negative" CHECK ("mileage" >= 0)
);

CREATE INDEX "vehicle_mileage_logs_business_id_vehicle_id_recorded_at_idx"
  ON "vehicle_mileage_logs"("business_id", "vehicle_id", "recorded_at" DESC);

ALTER TABLE "vehicle_mileage_logs"
  ADD CONSTRAINT "vehicle_mileage_logs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_mileage_logs"
  ADD CONSTRAINT "vehicle_mileage_logs_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fleet_vehicles" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "fleet_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fleet_vehicles_business_id_fleet_id_idx" ON "fleet_vehicles"("business_id", "fleet_id");
CREATE INDEX "fleet_vehicles_business_id_vehicle_id_idx" ON "fleet_vehicles"("business_id", "vehicle_id");
CREATE UNIQUE INDEX "fleet_vehicles_open_assignment_unique"
  ON "fleet_vehicles"("vehicle_id")
  WHERE "unassigned_at" IS NULL;

ALTER TABLE "fleet_vehicles"
  ADD CONSTRAINT "fleet_vehicles_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fleet_vehicles"
  ADD CONSTRAINT "fleet_vehicles_fleet_id_fkey"
  FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fleet_vehicles"
  ADD CONSTRAINT "fleet_vehicles_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
