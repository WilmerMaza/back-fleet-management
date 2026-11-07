-- H-07 Fase 1: UNIQUE (business_id, id) en padres críticos.
-- Prepara el soporte para FK compuestas multi-tenant (Fase 2).
-- No crea FK. No toca PK ni restricciones H-03.
--
-- Rollback manual (si hace falta):
--   ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_business_id_id_key";
--   ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_business_id_id_key";
--   ALTER TABLE "fleets" DROP CONSTRAINT IF EXISTS "fleets_business_id_id_key";
--   ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_business_id_id_key";
--   ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_business_id_id_key";

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_business_id_id_key" UNIQUE ("business_id", "id");

ALTER TABLE "products"
  ADD CONSTRAINT "products_business_id_id_key" UNIQUE ("business_id", "id");

ALTER TABLE "fleets"
  ADD CONSTRAINT "fleets_business_id_id_key" UNIQUE ("business_id", "id");

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_business_id_id_key" UNIQUE ("business_id", "id");

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_business_id_id_key" UNIQUE ("business_id", "id");
