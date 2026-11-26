-- Catálogo de tipos de servicio (contrato 05-service-catalog).
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(80),
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "parameters" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_types_business_id_id_key" ON "service_types"("business_id", "id");
CREATE UNIQUE INDEX "service_types_business_id_code_key" ON "service_types"("business_id", "code");
CREATE INDEX "service_types_business_id_status_idx" ON "service_types"("business_id", "status");
CREATE INDEX "service_types_business_id_name_idx" ON "service_types"("business_id", "name");

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
